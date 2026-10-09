import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../config/db';

/**
 * One place that decides a match score.
 *
 * Every screen (student feed, dashboard, job page, apply page, company review board)
 * gets its number from here, so the same student and job always show the same score.
 *
 * How consistency is kept:
 * 1. The score is stored once for each student and job pair.
 * 2. The stored score remembers which student and job details it was based on (inputHash).
 *    If the student edits their skills or course, or the company edits the job, the hash
 *    changes and the score is recalculated. No manual cache clearing is needed.
 * 3. Two requests for the same pair at the same moment share one calculation.
 * 4. Gemini is asked with temperature 0, so the same input gives the same answer.
 * 5. Students and companies use this same service, so both see the same number.
 */

export type ScoreSource = 'AI' | 'FALLBACK';

export interface MatchResult {
  score: number;
  reason: string;
  source: ScoreSource;
  matchedSkills: string[];
  missingSkills: string[];
}

export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

const PROMPT_VERSION = 'v2';
// Set GEMINI_MODEL in the environment to change the model without changing code.
const DEFAULT_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 15000;
// A fallback score is tried again with Gemini after this long, in case the AI was down.
const FALLBACK_RETRY_MS = 10 * 60 * 1000;
const MAX_CONCURRENT = 4;
export const MAX_BATCH = 30;

interface StudentInput {
  skills: string[];
  course: string | null;
}

interface JobInput {
  id: string;
  title: string;
  description: string;
  skillsRequired: string[];
}

interface ApplicantRow {
  id: string;
  studentId: string;
  student: { studentProfile: { skills: string[]; courseOfStudy: string | null } | null } | null;
}

interface Computed {
  score: number;
  reason: string;
  source: ScoreSource;
}

// ---------- skill matching (used by the fallback and by the matched / missing lists) ----------

const normalizeSkill = (skill: string): string =>
  skill.toLowerCase().replace(/[^a-z0-9+#]/g, '');

export const skillsMatch = (a: string, b: string): boolean => {
  const na = normalizeSkill(a);
  const nb = normalizeSkill(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = Math.min(na.length, nb.length);
  // Allow "SQL" to match "PostgreSQL", but stop one letter skills matching everything.
  return shorter >= 3 && (na.includes(nb) || nb.includes(na));
};

const uniqueSkills = (skills: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of skills) {
    const skill = raw.trim();
    const key = normalizeSkill(skill);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
  }
  return out;
};

export const splitSkills = (studentSkills: string[], jobSkills: string[]) => {
  const student = uniqueSkills(studentSkills);
  const job = uniqueSkills(jobSkills);
  const matchedSkills = job.filter((j) => student.some((s) => skillsMatch(s, j)));
  const missingSkills = job.filter((j) => !matchedSkills.includes(j));
  return { matchedSkills, missingSkills, totalJobSkills: job.length };
};

export const computeFallback = (studentSkills: string[], jobSkills: string[]): Computed => {
  const { matchedSkills, totalJobSkills } = splitSkills(studentSkills, jobSkills);
  const score = Math.min(
    95,
    40 + Math.round((matchedSkills.length / Math.max(totalJobSkills, 1)) * 55),
  );
  const reason =
    totalJobSkills === 0
      ? 'This job does not list required skills, so the score is a basic estimate.'
      : `You match ${matchedSkills.length} of ${totalJobSkills} required skills.`;
  return { score, reason, source: 'FALLBACK' };
};

// ---------- fingerprint ----------

export const buildInputHash = (student: StudentInput, job: JobInput): string => {
  const sortedSkills = (skills: string[]) =>
    uniqueSkills(skills).map(normalizeSkill).sort();
  const payload = JSON.stringify([
    PROMPT_VERSION,
    sortedSkills(student.skills),
    (student.course ?? '').trim().toLowerCase(),
    job.title.trim().toLowerCase(),
    sortedSkills(job.skillsRequired),
    job.description.substring(0, 300).trim(),
  ]);
  return crypto.createHash('sha256').update(payload).digest('hex');
};

// ---------- Gemini ----------

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Gemini request timed out.')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });

const askGemini = async (student: StudentInput, job: JobInput): Promise<Computed> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set.');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  });

  const studentSkills = uniqueSkills(student.skills);
  const jobSkills = uniqueSkills(job.skillsRequired);

  const prompt = `
You are an internship matching assistant. Calculate a match score between a student and a job posting.
Use the same standards every time, so identical input always gets an identical score.

Student Profile:
- Skills: ${studentSkills.length > 0 ? studentSkills.join(', ') : 'None listed'}
- Course of Study: ${student.course ?? 'Not specified'}

Job Posting:
- Title: ${job.title}
- Required Skills: ${jobSkills.length > 0 ? jobSkills.join(', ') : 'None listed'}
- Description: ${job.description.substring(0, 300)}

Calculate a whole number match score from 0 to 100 based on:
1. Skills overlap (most important)
2. Course relevance
3. Overall fit

Respond ONLY with a JSON object in this exact format, no other text:
{"score": 75, "reason": "Strong match in React and Node.js skills"}
Keep the reason under 140 characters.
`;

  const result = await withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT_MS);
  const text = result.response.text().trim();
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

  const raw = Number(parsed.score);
  if (!Number.isFinite(raw)) throw new Error('Gemini returned no usable score.');

  return {
    score: Math.min(100, Math.max(0, Math.round(raw))),
    reason:
      typeof parsed.reason === 'string' && parsed.reason.trim()
        ? parsed.reason.trim().substring(0, 200)
        : 'Based on skills and profile match',
    source: 'AI',
  };
};

const compute = async (student: StudentInput, job: JobInput): Promise<Computed> => {
  try {
    return await askGemini(student, job);
  } catch (error) {
    console.warn(
      `Match score: Gemini failed for job ${job.id}, using the skills overlap rule.`,
      error instanceof Error ? error.message : error,
    );
    return computeFallback(student.skills, job.skillsRequired);
  }
};

// ---------- storage ----------

const inflight = new Map<string, Promise<Computed>>();

const loadOrCompute = async (
  studentId: string,
  student: StudentInput,
  job: JobInput,
): Promise<Computed> => {
  const where = { studentId_jobId: { studentId, jobId: job.id } };
  const hash = buildInputHash(student, job);
  const cached = await prisma.matchScore.findUnique({ where });

  if (cached && cached.inputHash === hash) {
    const isFinal =
      cached.source === 'AI' || Date.now() - cached.updatedAt.getTime() < FALLBACK_RETRY_MS;
    if (isFinal) {
      return { score: cached.score, reason: cached.reason, source: cached.source as ScoreSource };
    }
  }

  const fresh = await compute(student, job);

  // First writer wins. If another server saved a score for this pair while we were
  // calculating, we return theirs, so every screen still agrees.
  if (!cached) {
    await prisma.matchScore.createMany({
      data: [{ studentId, jobId: job.id, ...fresh, inputHash: hash }],
      skipDuplicates: true,
    });
  } else {
    await prisma.matchScore.updateMany({
      where: { id: cached.id, updatedAt: cached.updatedAt },
      data: { ...fresh, inputHash: hash },
    });
  }

  const stored = await prisma.matchScore.findUnique({ where });
  return stored
    ? { score: stored.score, reason: stored.reason, source: stored.source as ScoreSource }
    : fresh;
};

const scorePair = async (
  studentId: string,
  student: StudentInput,
  job: JobInput,
): Promise<MatchResult> => {
  const key = `${studentId}:${job.id}`;
  let running = inflight.get(key);
  if (!running) {
    running = loadOrCompute(studentId, student, job).finally(() => inflight.delete(key));
    inflight.set(key, running);
  }
  const stored = await running;
  const { matchedSkills, missingSkills } = splitSkills(student.skills, job.skillsRequired);
  return { ...stored, matchedSkills, missingSkills };
};

// ---------- helpers ----------

const runLimited = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
};

const loadStudent = async (studentId: string): Promise<StudentInput> => {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { skills: true, courseOfStudy: true },
  });
  return { skills: profile?.skills ?? [], course: profile?.courseOfStudy ?? null };
};

const jobSelect = { id: true, title: true, description: true, skillsRequired: true } as const;

// ---------- public API ----------

/** Score for one student and one job. Used by the student job page and apply page. */
export const getMatchScore = async (studentId: string, jobId: string): Promise<MatchResult> => {
  const [student, job] = await Promise.all([
    loadStudent(studentId),
    prisma.jobPosting.findUnique({ where: { id: jobId }, select: jobSelect }),
  ]);
  if (!job) throw new NotFoundError('Job posting not found.');
  return scorePair(studentId, student, job);
};

/** Scores for many jobs at once, for the student feed, dashboard and company profile. */
export const getMatchScoresForStudent = async (
  studentId: string,
  jobIds: string[],
): Promise<Record<string, MatchResult>> => {
  const ids = Array.from(new Set(jobIds)).slice(0, MAX_BATCH);
  const [student, jobs]: [StudentInput, JobInput[]] = await Promise.all([
    loadStudent(studentId),
    prisma.jobPosting.findMany({ where: { id: { in: ids } }, select: jobSelect }),
  ]);

  const scores: Record<string, MatchResult> = {};
  await runLimited<JobInput, void>(jobs, MAX_CONCURRENT, async (job) => {
    try {
      scores[job.id] = await scorePair(studentId, student, job);
    } catch (error) {
      console.error(`Match score failed for job ${job.id}:`, error);
    }
  });
  return scores;
};

/** Scores for every applicant of one job. Used by the company screens. */
export const getApplicantScores = async (
  companyId: string,
  jobId: string,
): Promise<Record<string, MatchResult>> => {
  const job = await prisma.jobPosting.findUnique({
    where: { id: jobId },
    select: { ...jobSelect, companyId: true },
  });
  if (!job) throw new NotFoundError('Job posting not found.');
  if (job.companyId !== companyId) throw new ForbiddenError('You can only view scores for your own jobs.');

  const applications: ApplicantRow[] = await prisma.application.findMany({
    where: { jobPostingId: jobId },
    select: {
      id: true,
      studentId: true,
      student: { select: { studentProfile: { select: { skills: true, courseOfStudy: true } } } },
    },
  });

  const scores: Record<string, MatchResult> = {};
  await runLimited<ApplicantRow, void>(applications, MAX_CONCURRENT, async (application) => {
    try {
      const profile = application.student?.studentProfile;
      const student: StudentInput = {
        skills: profile?.skills ?? [],
        course: profile?.courseOfStudy ?? null,
      };
      scores[application.id] = await scorePair(application.studentId, student, job);
    } catch (error) {
      console.error(`Match score failed for application ${application.id}:`, error);
    }
  });
  return scores;
};