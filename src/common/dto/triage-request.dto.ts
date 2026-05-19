/**
 * Request DTO for POST /v1/encounters/triage.
 *
 * Validation strategy
 * -------------------
 * - `class-validator` decorators enforce types and clinically plausible ranges.
 *   Anything obviously absurd (temperatureC = 500, ageMonths = -5) is rejected
 *   with HTTP 400 *before* hitting the engine. The engine therefore never has
 *   to defend against malformed inputs.
 * - The DTO mirrors the ruleset's `inputSchema` 1:1. If a field exists in the
 *   ruleset and not the DTO, the engine cannot read it; if a field exists in
 *   the DTO and not the ruleset, the validator's `forbidNonWhitelisted` setting
 *   will reject it.
 * - Optional fields are explicitly `@IsOptional()` so a `null` or missing
 *   value is permitted; the engine has missing-info checks to surface gaps.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DemographicsDto {
  @ApiProperty({ minimum: 0, maximum: 60, description: 'Patient age in completed months.' })
  @IsInt()
  @Min(0)
  @Max(60)
  ageMonths!: number;

  @ApiProperty({ enum: ['male', 'female', 'other'] })
  @IsEnum(['male', 'female', 'other'])
  sex!: 'male' | 'female' | 'other';

  @ApiPropertyOptional({ minimum: 0.5, maximum: 30, description: 'Weight in kg, if measured.' })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(30)
  weightKg?: number;
}

export class VitalsDto {
  @ApiProperty({ minimum: 30, maximum: 43, description: 'Body temperature in Celsius.' })
  @IsNumber()
  @Min(30)
  @Max(43)
  temperatureC!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 300 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  heartRate?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 120, description: 'Counted over 60 seconds.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  respiratoryRate?: number;

  @ApiPropertyOptional({ minimum: 50, maximum: 100, description: 'Pulse oximetry %.' })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(100)
  spo2?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  capillaryRefillSec?: number;
}

export class HistoryDto {
  @ApiProperty({ minimum: 0, maximum: 30, description: 'Duration of current fever in days.' })
  @IsInt()
  @Min(0)
  @Max(30)
  feverDurationDays!: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() vaccinationUpToDate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() recentTravelMalariaZone?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() knownSickleCell?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() knownHIVExposure?: boolean;
}

export class SymptomsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() cough?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() fastBreathing?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() chestIndrawing?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() vomiting?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() diarrhea?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bloodyStool?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() rash?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() koplikSpots?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() neckStiffness?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bulgingFontanelle?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() earPain?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() earDischarge?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() poorFeeding?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sunkenEyes?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() skinPinchSlow?: boolean;
}

export class RedFlagsObservedDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() convulsions?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() lethargyOrUnconscious?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() unableToDrinkOrBreastfeed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() vomitingEverything?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() severeRespiratoryDistress?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() centralCyanosis?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() severeDehydration?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() stridorAtRest?: boolean;
}

export class TriageRequestDto {
  // -------- Identity (all optional in prototype; populated by EMR in production) --------
  @ApiPropertyOptional({ description: 'Client-supplied session identifier; auto-generated if absent.' })
  @IsOptional() @IsString() @MaxLength(64)
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Identifier for the clinician submitting the encounter.' })
  @IsOptional() @IsString() @MaxLength(128)
  clinicianId?: string;

  @ApiPropertyOptional({ description: 'Internal patient identifier (hashed in production).' })
  @IsOptional() @IsString() @MaxLength(128)
  patientId?: string;

  @ApiPropertyOptional({ description: 'EMR-side encounter identifier, if invoked from a hospital system.' })
  @IsOptional() @IsString() @MaxLength(128)
  externalEncounterId?: string;

  // -------- Clinical payload --------
  @ApiProperty({ type: DemographicsDto })
  @IsObject() @IsNotEmpty() @ValidateNested() @Type(() => DemographicsDto)
  demographics!: DemographicsDto;

  @ApiProperty({ type: VitalsDto })
  @IsObject() @IsNotEmpty() @ValidateNested() @Type(() => VitalsDto)
  vitals!: VitalsDto;

  @ApiProperty({ type: HistoryDto })
  @IsObject() @IsNotEmpty() @ValidateNested() @Type(() => HistoryDto)
  history!: HistoryDto;

  @ApiPropertyOptional({ type: SymptomsDto })
  @IsOptional() @IsObject() @ValidateNested() @Type(() => SymptomsDto)
  symptoms?: SymptomsDto;

  @ApiPropertyOptional({ type: RedFlagsObservedDto })
  @IsOptional() @IsObject() @ValidateNested() @Type(() => RedFlagsObservedDto)
  redFlagsObserved?: RedFlagsObservedDto;
}
