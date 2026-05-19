/**
 * Endpoints supporting the clinician audit trail.
 *
 *   GET   /v1/encounters/:auditId              → read a single audit record
 *   PATCH /v1/encounters/:auditId/disposition  → record accepted/ignored/overridden
 *
 * The PATCH endpoint is the only mutation allowed on an audit record, and it
 * is append-only (disposition fields are written exactly once). The original
 * input, output, and ruleset version cannot be edited via the API.
 */

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Model } from 'mongoose';
import { DispositionDto } from '../common/dto/disposition.dto';
import { EncounterAudit, EncounterAuditDocument } from './schemas/encounter-audit.schema';

@ApiTags('audit')
@Controller({ path: 'encounters', version: '1' })
export class AuditController {
  constructor(
    @InjectModel(EncounterAudit.name)
    private readonly model: Model<EncounterAuditDocument>,
  ) {}

  @Get(':auditId')
  @ApiOperation({ summary: 'Fetch a single audit record by auditId.' })
  @ApiParam({ name: 'auditId', example: 'enc_01HXY...' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Audit not found (or not yet persisted by worker).' })
  async getOne(@Param('auditId') auditId: string): Promise<EncounterAudit> {
    const doc = await this.model.findOne({ auditId }).lean<EncounterAudit>().exec();
    if (!doc) throw new NotFoundException(`Audit ${auditId} not found.`);
    return doc;
  }

  @Patch(':auditId/disposition')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record clinician disposition (accepted / ignored / overridden).',
    description:
      'Append-only. Once a disposition is recorded for an auditId, further PATCH ' +
      'attempts return 409 Conflict. "overridden" requires a free-text reason for ' +
      'medico-legal traceability.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Missing override reason or invalid action.' })
  @ApiResponse({ status: 404, description: 'Audit not found.' })
  @ApiResponse({ status: 409, description: 'Disposition already recorded.' })
  async setDisposition(
    @Param('auditId') auditId: string,
    @Body() body: DispositionDto,
  ): Promise<EncounterAudit> {
    if (body.action === 'overridden' && !body.reason?.trim()) {
      throw new BadRequestException(
        'A reason is required when disposition.action = "overridden".',
      );
    }

    // Append-only update: only succeed if dispositionAction is currently unset.
    const updated = await this.model
      .findOneAndUpdate(
        { auditId, dispositionAction: { $exists: false } },
        {
          $set: {
            dispositionAction: body.action,
            dispositionReason: body.reason,
            dispositionClinicianId: body.clinicianId,
            dispositionAt: new Date(),
          },
        },
        { new: true },
      )
      .lean<EncounterAudit>()
      .exec();

    if (!updated) {
      // Either the audit doesn't exist, or it already has a disposition.
      const exists = await this.model.exists({ auditId });
      if (!exists) throw new NotFoundException(`Audit ${auditId} not found.`);
      throw new ConflictException(`Disposition already recorded for ${auditId}.`);
    }
    return updated;
  }
}
