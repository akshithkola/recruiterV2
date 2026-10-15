import { extractPlainTextFromResumeBuffer } from './extractResumeText';
import {
  parseCoreFieldsFromResumeText,
  extractHighestQualificationFromAnyText,
  extractTotalExperienceInfo,
  extractVerbatimDesignation,
  cleanAndValidateRoleOrTechnologies,
  extractCurrentLocation,
} from './parseCoreResumeFields';
import {
  extractSkillsWithEngineSync,
  extractSkillsWithEngine,
  validateSkillsAgainstSection,
} from './skillsExtractionEngine';
import {
  isCertificationOrNonAcademic,
  cleanAcademicSpecialization,
  compactHighestQualification,
  sanitizeDisplayText,
} from './resumeFieldSanitize';
import { isSupportedFile, extractFileContent } from './ai/extract';
import { parseResumeFromPdf, parseResumeFromText, extractSkillsWithGemini } from './ai/gemini';
import { config, getAiModelLabel } from './ai/config';
import {
  ParsedCandidateResume,
  BulkParseItemResult,
  MetaforgeParsed,
} from './types';

export type { ParsedCandidateResume, BulkParseItemResult };

let aiParsingSuspended = false;
let aiParsingSuspendedReason: string | null = null;

function isQuotaOrRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /quota|rate.?limit|429|resource.?exhausted|too many requests|high demand|overloaded|503|unavailable|busy|invalid.*key|not found|not supported/i.test(
    msg,
  );
}

export function getAiParsingSuspendedReason(): string | null {
  return aiParsingSuspendedReason;
}

export function isMetaforgeParserAvailable(): boolean {
  return Boolean(config.geminiApiKey);
}

function normalizeLinkedInUrl(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^linkedin\.com/i.test(t) || /^www\.linkedin\.com/i.test(t)) {
    return `https://${t.replace(/^www\./i, '')}`;
  }
  if (/^\/in\//i.test(t)) return `https://www.linkedin.com${t}`;
  return t.includes('linkedin.com') ? `https://${t.replace(/^https?:\/\//i, '')}` : null;
}

function joinList(items: string[] | null | undefined): string | null {
  if (!Array.isArray(items) || !items.length) return null;
  const cleaned = items.map((s) => s.trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(', ') : null;
}

function mapMetaforgeResult(parsed: MetaforgeParsed, sourceFile: string): ParsedCandidateResume {
  const skills = joinList(parsed.skills);
  const technology = joinList(parsed.technology);
  const role = cleanAndValidateRoleOrTechnologies(parsed.role);

  return {
    candidateName: (parsed.full_name ?? '').trim() || null,
    email: (parsed.email ?? '').trim() || null,
    contactNumber: (parsed.contact ?? '').trim() || null,
    linkedinUrl: normalizeLinkedInUrl(parsed.linkedin),
    highestQualification: (parsed.qualification ?? '').trim() || null,
    skillsRaw: skills ?? technology,
    technologiesRaw: role,
    technologies: role,
    totalExperience: (parsed.total_experience ?? '').trim() || null,
    relevantExperience: null,
    currentEmployer: null,
    currentLocation: (parsed.location ?? parsed.current_location ?? '').trim() || null,
    location: (parsed.location ?? parsed.current_location ?? '').trim() || null,
    sourceFile,
    parser: 'metaforge',
    role,
  };
}

function mapLegacyResult(
  parsed: ReturnType<typeof parseCoreFieldsFromResumeText>,
  sourceFile: string,
): ParsedCandidateResume {
  const role = cleanAndValidateRoleOrTechnologies(parsed.role ?? parsed.technologiesRaw);
  return {
    candidateName: parsed.candidateName,
    email: parsed.email,
    contactNumber: parsed.contactNumber,
    linkedinUrl: parsed.linkedinUrl,
    highestQualification: parsed.highestQualification,
    skillsRaw: parsed.skillsRaw ?? null,
    technologiesRaw: role,
    technologies: role,
    totalExperience: parsed.totalExperienceText || '',
    relevantExperience: null,
    currentEmployer: parsed.currentCompany,
    currentLocation: parsed.currentLocation || null,
    location: parsed.currentLocation || null,
    sourceFile,
    parser: 'legacy',
    role,
  };
}

/**
 * Strict Evidence Lock for the four priority fields:
 * 1. qualification: Highest academic degree + course/branch/specialization verbatim.
 * 2. total_experience: Explicit stated experience has absolute priority verbatim.
 * 3. relevant_experience: Blank ("") unconditionally.
 * 4. skills: Strictly from eligible Skills section only. Never from responsibilities, projects, or summary.
 * 5. role: Verbatim current/latest designation. Supported by resume text.
 */
export function applyEvidenceLock(
  candidate: ParsedCandidateResume,
  rawText: string,
): ParsedCandidateResume {
  const normText = rawText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
  const normLower = normText.toLowerCase();

  const hasTextEvidence = (phrase: string | null | undefined): boolean => {
    if (!phrase) return false;
    const clean = phrase.trim().toLowerCase();
    if (!clean) return false;
    return normLower.includes(clean);
  };

  // 1. QUALIFICATION
  let qual = candidate.highestQualification?.trim() || null;
  if (qual) {
    if (isCertificationOrNonAcademic(qual)) {
      qual = null;
    } else {
      qual = compactHighestQualification(qual) || cleanAcademicSpecialization(qual);
      if (qual) {
        const words = qual.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        const hasEvidence = words.some((w) => normLower.includes(w));
        if (!hasEvidence) {
          qual = null;
        }
      }
    }
  }
  if (!qual && rawText.trim()) {
    qual = extractHighestQualificationFromAnyText(rawText);
  }
  if (qual) {
    qual = cleanAcademicSpecialization(qual) || compactHighestQualification(qual) || qual;
    if (isCertificationOrNonAcademic(qual)) {
      qual = null;
    }
  }

  // 2. TOTAL EXPERIENCE & RELEVANT EXPERIENCE
  const expInfo = rawText.trim() ? extractTotalExperienceInfo(rawText) : { text: '', years: null };
  let finalTotalExp: string = '';

  if (expInfo.text?.trim()) {
    finalTotalExp = expInfo.text.trim();
  } else if (candidate.totalExperience?.trim()) {
    const candidateExp = candidate.totalExperience.trim();
    const verified = extractTotalExperienceInfo(candidateExp);
    if (verified.text?.trim()) {
      const numMatch = verified.text.match(/^(\d+(?:\.\d+)?\+?)/);
      if (numMatch && numMatch[1]) {
        const numEscaped = numMatch[1].replace('+', '\\+');
        const inTextRe = new RegExp(`\\b${numEscaped}\\s*(?:years?|yrs?|months?|mos?)`, 'i');
        if (inTextRe.test(rawText)) {
          finalTotalExp = verified.text.trim();
        }
      }
    }
  }

  const finalRelevantExp = null;

  // 3. SKILLS
  const skillsEngineRes = extractSkillsWithEngineSync(rawText);
  let finalSkillsRaw: string | null = null;

  if (skillsEngineRes.diagnostics.sectionDetected && skillsEngineRes.skills.length > 0) {
    finalSkillsRaw = skillsEngineRes.skills.slice(0, 10).join(', ');
  } else {
    const deterministicFallback = skillsEngineRes.skills;
    const aiTokens = candidate.skillsRaw
      ? candidate.skillsRaw
          .split(/[,;\n|]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const { validSkills: validAiTokens } = validateSkillsAgainstSection(aiTokens, rawText, 10);
    const combined = [...deterministicFallback, ...validAiTokens];
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const s of combined) {
      const k = s.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        deduped.push(s);
        if (deduped.length >= 10) break;
      }
    }
    finalSkillsRaw = deduped.length > 0 ? deduped.join(', ') : null;
  }

  // 4. ROLE / DESIGNATION / DOMAIN / TECHNOLOGIES
  const verbatimFromText = rawText.trim()
    ? cleanAndValidateRoleOrTechnologies(extractVerbatimDesignation(rawText, candidate.currentEmployer))
    : null;

  let role: string | null = null;
  if (verbatimFromText) {
    role = verbatimFromText;
  } else if (candidate.role || candidate.technologiesRaw) {
    const rawRole = candidate.role?.trim() || candidate.technologiesRaw?.trim() || null;
    const validatedCandidateRole = cleanAndValidateRoleOrTechnologies(rawRole);
    if (validatedCandidateRole && hasTextEvidence(validatedCandidateRole)) {
      role = validatedCandidateRole;
    }
  }

  const finalRole = role || null;

  // 5. LOCATION
  const locCandidate = candidate.currentLocation?.trim() || candidate.location?.trim() || null;
  const locFromText = rawText.trim() ? extractCurrentLocation(rawText) : null;
  const finalLocation = locCandidate || locFromText || null;

  return {
    ...candidate,
    highestQualification: qual ? sanitizeDisplayText(qual) : null,
    totalExperience: finalTotalExp ? sanitizeDisplayText(finalTotalExp) : '',
    relevantExperience: finalRelevantExp,
    skillsRaw: finalSkillsRaw,
    technologiesRaw: finalRole,
    technologies: finalRole,
    role: finalRole,
    currentLocation: finalLocation ? sanitizeDisplayText(finalLocation) : null,
    location: finalLocation ? sanitizeDisplayText(finalLocation) : null,
  };
}

export async function parseResumeBufferWithMetaforge(
  buffer: Buffer,
  filename: string,
): Promise<ParsedCandidateResume> {
  if (!isSupportedFile(filename)) {
    throw new Error('Unsupported file type. Supported: pdf, docx, doc, txt');
  }

  const extracted = await extractFileContent(buffer, filename);
  let parsed: MetaforgeParsed;
  if (extracted.type === 'pdf') {
    parsed = await parseResumeFromPdf(extracted.data, buffer);
  } else {
    parsed = await parseResumeFromText(extracted.data);
  }

  const { text: rawText } = await extractPlainTextFromResumeBuffer(buffer, filename);
  const textForEvidence = rawText || (extracted.type === 'text' ? extracted.data : '');

  const mapped = mapMetaforgeResult(parsed, filename);
  if (!mapped.skillsRaw) {
    try {
      const aiSkillsRes = await extractSkillsWithEngine(textForEvidence, {
        enableAiFallback: true,
        aiFallbackFn: extractSkillsWithGemini,
      });
      if (aiSkillsRes.skillsRaw) {
        mapped.skillsRaw = aiSkillsRes.skillsRaw;
      }
    } catch {
      // ignore AI fallback failure
    }
  }
  return applyEvidenceLock(mapped, textForEvidence);
}

export async function parseResumeBufferLegacy(
  buffer: Buffer,
  filename: string,
): Promise<ParsedCandidateResume> {
  const { text, error } = await extractPlainTextFromResumeBuffer(buffer, filename);
  if (!text.trim()) {
    throw new Error(error || 'Could not read text from this file.');
  }
  const parsed = parseCoreFieldsFromResumeText(text);
  const mapped = mapLegacyResult(parsed, filename);
  return applyEvidenceLock(mapped, text);
}

export async function parseResumeBuffer(
  buffer: Buffer,
  filename: string,
): Promise<ParsedCandidateResume> {
  if (isMetaforgeParserAvailable() && !aiParsingSuspended) {
    try {
      return await parseResumeBufferWithMetaforge(buffer, filename);
    } catch (err) {
      if (isQuotaOrRateLimitError(err)) {
        aiParsingSuspended = true;
        aiParsingSuspendedReason =
          'Gemini API quota or rate limit reached — using keyword parser for remaining resumes.';
        console.warn(aiParsingSuspendedReason);
      } else {
        console.warn(
          'Metaforge resume parse failed, falling back to keyword parser:',
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return parseResumeBufferLegacy(buffer, filename);
}

export async function parseResumeBuffersBulk(
  files: { buffer: Buffer; filename: string }[],
): Promise<BulkParseItemResult[]> {
  const results: BulkParseItemResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const { buffer, filename } = files[i]!;
    try {
      const data = await parseResumeBuffer(buffer, filename);
      results.push({ sourceFile: filename, status: 'done', data });
    } catch (err) {
      results.push({
        sourceFile: filename,
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to parse resume',
      });
    }

    if (i < files.length - 1 && isMetaforgeParserAvailable() && !aiParsingSuspended) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  return results;
}
