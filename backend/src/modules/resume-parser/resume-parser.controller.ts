import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  MAX_BULK_RESUMES,
  MAX_RESUME_BYTES,
  RESUME_EXTENSIONS,
  ResumeParserService,
  UploadedResume,
} from './resume-parser.service';

const uploadOptions = {
  limits: { fileSize: MAX_RESUME_BYTES, files: MAX_BULK_RESUMES },
  fileFilter: (_req: any, file: { originalname: string }, cb: (e: Error | null, ok: boolean) => void) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!RESUME_EXTENSIONS.has(ext)) {
      return cb(new BadRequestException(`${file.originalname}: unsupported format. Use PDF, DOCX, DOC, TXT or an image.`), false);
    }
    cb(null, true);
  },
};

/** Resume parsing for the Candidate Search & Entry page (single and bulk). */
@Controller('resume-parser')
@UseGuards(JwtAuthGuard)
export class ResumeParserController {
  constructor(private readonly parser: ResumeParserService) {}

  /** GET /api/v1/resume-parser/health */
  @Get('health')
  health() {
    return this.parser.health();
  }

  /** POST /api/v1/resume-parser/parse  (multipart field "resume") */
  @Post('parse')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('resume', uploadOptions))
  async parse(@UploadedFile() file?: UploadedResume) {
    if (!file?.buffer?.length) throw new BadRequestException('Upload a resume under the form field "resume"');
    return { success: true, data: await this.parser.parseOne(file) };
  }

  /** POST /api/v1/resume-parser/parse/bulk  (multipart field "resumes", up to 5 per request) */
  @Post('parse/bulk')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor('resumes', MAX_BULK_RESUMES, uploadOptions))
  async parseBulk(@UploadedFiles() files?: UploadedResume[]) {
    const valid = (files || []).filter((f) => f?.buffer?.length);
    if (!valid.length) throw new BadRequestException('Upload at least one resume under the form field "resumes"');
    const results = await this.parser.parseMany(valid);
    return {
      success: true,
      count: results.length,
      parsed: results.filter((r) => r.status === 'done').length,
      failed: results.filter((r) => r.status === 'error').length,
      notice: this.parser.health().aiSuspendedNotice || null,
      results,
    };
  }
}
