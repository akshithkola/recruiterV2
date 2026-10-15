import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphMailService } from './graph-mail.service';
import { NodemailerMailService } from './nodemailer-mail.service';
import { SendMailInput } from './mail.types';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly graphMailService: GraphMailService,
    private readonly nodemailerMailService: NodemailerMailService,
  ) {}

  async sendMail(input: SendMailInput): Promise<{ accepted: true }> {
    const rawProvider = this.config.get<string>('MAIL_PROVIDER') || 'nodemailer';
    const provider = rawProvider.toString().replace(/^["']|["']$/g, '').trim().toLowerCase();

    if (provider === 'graph') {
      this.logger.log('Dispatching email via Microsoft Graph provider');
      return this.graphMailService.sendMail(input);
    }

    this.logger.log('Dispatching email via Nodemailer SMTP provider (smtp.office365.com:587)');
    return this.nodemailerMailService.sendMail(input);
  }
}
