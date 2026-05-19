/**
 * Request DTO for PATCH /v1/encounters/:auditId/disposition.
 *
 * Captures what the clinician actually did with the engine's recommendation —
 * required by the assessment scenario:
 *   "preserve an audit trail showing what the clinician saw and whether
 *    they accepted, ignored, or overrode the recommendation."
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export type DispositionAction = 'accepted' | 'ignored' | 'overridden';

export class DispositionDto {
  @ApiProperty({
    enum: ['accepted', 'ignored', 'overridden'],
    description:
      'What the clinician did with the engine output. ' +
      '"overridden" requires a free-text reason for medico-legal traceability.',
  })
  @IsEnum(['accepted', 'ignored', 'overridden'])
  action!: DispositionAction;

  @ApiPropertyOptional({
    description:
      'Free-text reason. Required when action = "overridden"; the controller enforces this at runtime.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional({ description: 'Clinician identifier recording the disposition.' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clinicianId?: string;
}
