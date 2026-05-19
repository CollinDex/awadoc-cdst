import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TriageRequestDto } from '../common/dto/triage-request.dto';
import { TriageResponse, TriageService } from './triage.service';

/**
 * POST /v1/encounters/triage
 *
 * The only critical-path endpoint in the system. Accepts a structured
 * encounter, returns the engine's deterministic triage output plus an
 * auditId the clinician can later use to record disposition.
 */
@ApiTags('triage')
@Controller({ path: 'encounters/triage', version: '1' })
export class TriageController {
  constructor(private readonly triageService: TriageService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run deterministic triage on a structured paediatric febrile encounter.',
    description:
      'Accepts validated clinical inputs and returns a triage level (Emergency / Urgent / ' +
      'Semi-Urgent / Routine), ranked differentials, triggered red flags, recommended ' +
      'next-step actions, and any missing-information prompts. The decision path is fully ' +
      'deterministic — no LLM in the critical loop. ' +
      'If any red flag fires, the response is forced to Emergency (safety override).',
  })
  @ApiResponse({ status: 200, description: 'Triage evaluated successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failure — clinically impossible input.' })
  triage(@Body() body: TriageRequestDto): Promise<TriageResponse> {
    return this.triageService.runTriage(body);
  }
}
