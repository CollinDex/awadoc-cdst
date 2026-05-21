import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TriageController } from '../triage.controller';
import { TriageService } from '../triage.service';
import { RulesetLoader } from '../engine/ruleset-loader';
import { AuditService } from '../../audit/audit.service';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';

/**
 * HTTP integration tests — validates the full DTO validation → engine → HTTP
 * response pipeline without a real MongoDB or Redis connection.
 *
 * AuditService.enqueueAudit is mocked (fire-and-forget call) so no Redis/Bull
 * is needed. RulesetLoader reads the real JSON file from disk via ConfigModule
 * with its default ACTIVE_RULESET_FILE fallback.
 */
describe('POST /v1/encounters/triage (HTTP integration)', () => {
  let app: INestApplication;
  const auditSpy = jest.fn().mockResolvedValue(undefined);

  const BASE_PAYLOAD = {
    sessionId: 'http-test-session',
    demographics: { ageMonths: 24, sex: 'male' },
    vitals: { temperatureC: 38.5 },
    history: { feverDurationDays: 2 },
    symptoms: {},
    redFlagsObserved: {},
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true })],
      controllers: [TriageController],
      providers: [
        TriageService,
        RulesetLoader,
        { provide: AuditService, useValue: { enqueueAudit: auditSpy } },
      ],
    }).compile();

    app = module.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => auditSpy.mockClear());

  it('golden path — travel history + fever → 200, Urgent triage, malaria top differential', async () => {
    const payload = {
      ...BASE_PAYLOAD,
      history: { feverDurationDays: 2, recentTravelMalariaZone: true },
    };

    const { body } = await request(app.getHttpServer())
      .post('/v1/encounters/triage')
      .send(payload)
      .expect(200);

    expect(body.triage.level).toBe('Urgent');
    expect(body.evaluationPath).toBe('standard');
    expect(body.differentials[0].id).toBe('DX_MALARIA');
    expect(body.redFlags).toHaveLength(0);
    expect(body.auditId).toMatch(/^enc_/);
    expect(auditSpy).toHaveBeenCalledTimes(1);
  });

  it('safety override — convulsions contradicts mild presentation → 200, Emergency, override path', async () => {
    const payload = {
      ...BASE_PAYLOAD,
      vitals: { temperatureC: 37.5 },
      symptoms: { cough: true },
      redFlagsObserved: { convulsions: true },
    };

    const { body } = await request(app.getHttpServer())
      .post('/v1/encounters/triage')
      .send(payload)
      .expect(200);

    expect(body.triage.level).toBe('Emergency');
    expect(body.evaluationPath).toBe('safety-override');
    expect(body.redFlags.length).toBeGreaterThanOrEqual(1);
    expect(body.redFlags[0].id).toBe('RF_CONVULSIONS');
    expect(body.auditId).toBeDefined();
  });

  it('DTO validation — temperature out of range → 400 with structured error shape', async () => {
    const payload = { ...BASE_PAYLOAD, vitals: { temperatureC: 99 } };

    const { body } = await request(app.getHttpServer())
      .post('/v1/encounters/triage')
      .send(payload)
      .expect(400);

    expect(body.error).toBeDefined();
    expect(body.message).toBeDefined();
  });
});
