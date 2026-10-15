import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import {
  parseResumeBuffer,
  parseResumeBuffersBulk,
  isMetaforgeParserAvailable,
  getAiParsingSuspendedReason,
} from '../metaforgeParser';

/**
 * In-memory upload for resume text extraction (no disk writes).
 * Supports standard PDF, Word documents, text files, and scanned images.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = new Set([
      '.pdf',
      '.doc',
      '.docx',
      '.txt',
      '.png',
      '.jpg',
      '.jpeg',
      '.webp',
      '.bmp',
      '.tif',
      '.tiff',
    ]);
    if (!allowed.has(ext)) {
      return cb(new Error(`File format ${ext} is not supported. Supported: PDF, DOCX, DOC, TXT, and common image formats.`));
    }
    return cb(null, true);
  },
});

export const resumeParserRouter = Router();

/**
 * @route   GET /health
 * @desc    Check parser status and AI availability
 */
resumeParserRouter.get('/health', (_req: Request, res: Response) => {
  const aiAvailable = isMetaforgeParserAvailable();
  const suspendedReason = getAiParsingSuspendedReason();

  res.json({
    status: 'ok',
    service: 'resume-parser-module',
    aiParserAvailable: aiAvailable,
    aiSuspendedNotice: suspendedReason,
    mode: aiAvailable && !suspendedReason ? 'hybrid-ai-with-fallback' : 'local-deterministic',
  });
});

/**
 * @route   POST /parse
 * @desc    Parse a single resume file
 * @body    multipart/form-data with field name 'resume' (or 'file')
 */
resumeParserRouter.post(
  '/parse',
  (req, res, next) => {
    req.setTimeout(5 * 60 * 1000);
    res.setTimeout(5 * 60 * 1000);
    next();
  },
  upload.single('resume'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file?.buffer) {
        res.status(400).json({
          success: false,
          message: 'Resume file is required under form field "resume"',
        });
        return;
      }

      const filename = file.originalname || 'resume.pdf';
      const parsed = await parseResumeBuffer(file.buffer, filename);

      res.json({
        success: true,
        message: 'Resume parsed successfully',
        data: parsed,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error?.message || 'Failed to parse resume',
      });
    }
  }
);

/**
 * @route   POST /parse/bulk
 * @desc    Parse multiple resumes (up to 5)
 * @body    multipart/form-data with field name 'resumes' (or 'files')
 */
resumeParserRouter.post(
  '/parse/bulk',
  (req, res, next) => {
    req.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);
    next();
  },
  upload.array('resumes', 5),
  async (req: Request, res: Response) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) {
        res.status(400).json({
          success: false,
          message: 'At least one resume file is required under form field "resumes"',
        });
        return;
      }

      if (files.length > 5) {
        res.status(400).json({
          success: false,
          message: 'Maximum 5 resumes allowed per batch upload',
        });
        return;
      }

      const inputs = files
        .filter((f) => f?.buffer)
        .map((f) => ({
          buffer: f.buffer,
          filename: f.originalname || 'resume.pdf',
        }));

      if (!inputs.length) {
        res.status(400).json({
          success: false,
          message: 'No valid resume file buffers received',
        });
        return;
      }

      const results = await parseResumeBuffersBulk(inputs);
      const usedLegacy = results.some((r) => r.status === 'done' && r.data.parser === 'legacy');
      const aiNotice = getAiParsingSuspendedReason();

      res.json({
        success: true,
        message: 'Bulk resume parse completed',
        count: results.length,
        parser:
          isMetaforgeParserAvailable() && !usedLegacy && !aiNotice ? 'metaforge' : 'legacy',
        notice: aiNotice,
        results,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error?.message || 'Bulk resume parse failed',
      });
    }
  }
);

export default resumeParserRouter;
