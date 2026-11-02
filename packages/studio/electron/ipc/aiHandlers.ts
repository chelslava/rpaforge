/**
 * AI generation IPC handlers (extracted from main.ts, issue #828).
 *
 * Owns the in-flight generation abort registry and the data-sharing
 * consent dialog shown before any remote provider call.
 */

import { ipcMain, dialog } from 'electron';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import type {
  AiGenerateDiagramRequest,
  AiSetProviderKeyRequest,
  AiAutoFillRequest,
  AiProviderId,
  AiCompareRequest,
  AiCompareResult,
  AiStreamDeltaEvent,
  SuggestionContext,
} from '../../src/types/ai';
import { validateIPCPayload } from '../ipc-validator';
import { getProvider } from '../ai/providers';
import { generateDiagram } from '../ai/generateDiagram';
import { getActivitySuggestions } from '../ai/suggestions';
import {
  getProviderConfig,
  setProviderConfig,
  removeProviderConfig,
  getProviderStatuses,
} from '../ai/keyStore';
import { grantAiConsent, hasAiConsent, type AiConsentFeature } from '../ai/consentStore';
import { isLocalEndpoint } from '../ai/privacy';
import { autoFillParams } from '../ai/paramFill';
import { estimateTokenCost } from '../ai/tokenCost';
import { recordSecurityEvent } from '../audit/securityAudit';
import { createLogger } from '../../src/utils/logger';
import type { IpcContext } from './context';

const logger = createLogger('ipc-ai');

const aiAbortControllers: Map<string, AbortController> = new Map();

const AI_CONSENT_CATEGORIES = ['prompt text', 'activity metadata', 'variable names and defaults'];

async function ensureAiConsent(
  ctx: IpcContext,
  feature: AiConsentFeature,
  providerId: AiProviderId,
  baseUrl: string | undefined,
  language?: string,
): Promise<boolean> {
  if (isLocalEndpoint(providerId, baseUrl) || hasAiConsent(feature)) return true;

  const russian = language?.toLowerCase().startsWith('ru') ?? false;
  const title = russian ? 'Передача данных в AI-провайдер' : 'AI data sharing disclosure';
  const message = russian
    ? `Для функции «${feature}» данные будут отправлены удалённому провайдеру:\n\n• ${AI_CONSENT_CATEGORIES.join('\n• ')}\n\nПродолжить?`
    : `The “${feature}” feature will send data to a remote AI provider:\n\n• ${AI_CONSENT_CATEGORIES.join('\n• ')}\n\nContinue?`;
  const options = {
    type: 'warning' as const,
    title,
    message,
    buttons: russian ? ['Продолжить', 'Отмена'] : ['Continue', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
  const mainWindow = ctx.getMainWindow();
  const result = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  if (result.response !== 0) return false;
  await grantAiConsent(feature);
  return true;
}

export function registerAiHandlers(ctx: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.AI_GENERATE_DIAGRAM, async (event, request: AiGenerateDiagramRequest) => {
    validateIPCPayload(event, 'ai:generateDiagram', request);

    const config = getProviderConfig(request.providerId);
    if (!config) {
      return {
        success: false,
        errors: [`Provider "${request.providerId}" is not configured.`],
        attempts: 0,
      };
    }

    if (!(await ensureAiConsent(ctx, 'diagram', request.providerId, config.baseUrl, request.language))) {
      return {
        success: false,
        consentRequired: true,
        consentFeature: 'diagram',
        consentCategories: AI_CONSENT_CATEGORIES,
        errors: [],
        attempts: 0,
      };
    }

    const controller = new AbortController();
    aiAbortControllers.set(request.requestId, controller);

    try {
      const result = await generateDiagram(
        getProvider(request.providerId),
        config,
        { prompt: request.prompt, activities: request.activities, language: request.language },
        controller.signal,
        (progressEvent) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.AI_PROGRESS, progressEvent);
          }
        },
        (delta, attempt) => {
          if (!event.sender.isDestroyed()) {
            const deltaEvent: AiStreamDeltaEvent = { kind: 'delta', attempt, delta };
            event.sender.send(IPC_CHANNELS.AI_PROGRESS, deltaEvent);
          }
        }
      );
      if (!result.success) {
        logger.error(`AI diagram generation failed (provider=${request.providerId}, attempts=${result.attempts})`, {
          errorCount: result.errors?.length ?? 0,
        });
      }
      const resultWithCost = result.tokenUsage
        ? { ...result, tokenUsage: { ...result.tokenUsage, costEstimate: estimateTokenCost(request.providerId, config.model, result.tokenUsage) } }
        : result;
      await recordSecurityEvent('ai_generation', {
        provider: request.providerId,
        success: resultWithCost.success,
        tokenCount: resultWithCost.tokenUsage?.total ?? 0,
      });
      return resultWithCost;
    } finally {
      aiAbortControllers.delete(request.requestId);
    }
  });

  ipcMain.handle(IPC_CHANNELS.AI_CANCEL_GENERATE, async (event, requestId: string) => {
    validateIPCPayload(event, 'ai:cancelGenerate', { requestId });
    aiAbortControllers.get(requestId)?.abort();
    aiAbortControllers.delete(requestId);
  });

  ipcMain.handle(IPC_CHANNELS.AI_SET_PROVIDER_KEY, async (event, request: AiSetProviderKeyRequest) => {
    validateIPCPayload(event, 'ai:setProviderKey', request);
    await setProviderConfig(request.provider, {
      apiKey: request.apiKey,
      baseUrl: request.baseUrl,
      model: request.model,
    });
    await recordSecurityEvent('ai_provider_key_change', { provider: request.provider, action: 'set' });
  });

  ipcMain.handle(IPC_CHANNELS.AI_REMOVE_PROVIDER_KEY, async (event, provider: AiProviderId) => {
    validateIPCPayload(event, 'ai:removeProviderKey', { provider });
    await removeProviderConfig(provider);
    await recordSecurityEvent('ai_provider_key_change', { provider, action: 'remove' });
  });

  ipcMain.handle(IPC_CHANNELS.AI_TEST_PROVIDER, async (event, provider: AiProviderId) => {
    validateIPCPayload(event, 'ai:testProvider', { provider });
    const config = getProviderConfig(provider);
    if (!config) {
      return { ok: false, error: `Provider "${provider}" is not configured.` };
    }
    try {
      await getProvider(provider).test(config);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AI_GET_PROVIDER_STATUS, async (event) => {
    validateIPCPayload(event, 'ai:getProviderStatus', {});
    return getProviderStatuses();
  });

  ipcMain.handle(IPC_CHANNELS.AI_COMPARE_PROVIDERS, async (event, request: AiCompareRequest) => {
    validateIPCPayload(event, 'ai:compareProviders', request);

    const remoteProvider = request.providers
      .map((providerReq) => ({ providerReq, config: getProviderConfig(providerReq.providerId) }))
      .find(({ providerReq, config }) => config && !isLocalEndpoint(providerReq.providerId, config.baseUrl));
    if (remoteProvider && !(await ensureAiConsent(
      ctx,
      'compare',
      remoteProvider.providerReq.providerId,
      remoteProvider.config?.baseUrl,
      remoteProvider.providerReq.language,
    ))) {
      return {
        results: [],
        requestId: request.requestId,
        consentRequired: true,
        consentFeature: 'compare',
        consentCategories: AI_CONSENT_CATEGORIES,
      };
    }

    const controllers: AbortController[] = [];
    try {
      const results = await Promise.all(
        request.providers.map(async (providerReq) => {
          const config = getProviderConfig(providerReq.providerId);
          if (!config) {
            return {
              providerId: providerReq.providerId,
              success: false,
              errors: [`Provider "${providerReq.providerId}" is not configured.`],
              tokenUsage: undefined,
            };
          }
          const controller = new AbortController();
          controllers.push(controller);

          const result = await generateDiagram(
            getProvider(providerReq.providerId),
            config,
            { prompt: providerReq.prompt, activities: providerReq.activities, language: providerReq.language },
            controller.signal,
          );
          return {
            providerId: providerReq.providerId,
            ...result,
            tokenUsage: result.tokenUsage
              ? { ...result.tokenUsage, costEstimate: estimateTokenCost(providerReq.providerId, config.model, result.tokenUsage) }
              : undefined,
          };
        })
      );

      const compareResult: AiCompareResult = { results, requestId: request.requestId };
      await Promise.all(results.map((result) => recordSecurityEvent('ai_generation', {
        provider: result.providerId,
        success: result.success,
        tokenCount: result.tokenUsage?.total ?? 0,
      })));
      return compareResult;
    } finally {
      for (const controller of controllers) {
        try { controller.abort(); } catch { /* ignore */ }
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.AI_GET_SUGGESTIONS, async (event, context: SuggestionContext) => {
    validateIPCPayload(event, 'ai:getSuggestions', context);

    const providerStatuses = await getProviderStatuses();
    const configuredProvider = providerStatuses.find(p => p.configured);

    if (!configuredProvider) {
      return { suggestions: [] };
    }

    const providerConfig = getProviderConfig(configuredProvider.provider);
    if (!providerConfig) {
      return { suggestions: [] };
    }

    if (!(await ensureAiConsent(ctx, 'suggestions', configuredProvider.provider, providerConfig.baseUrl, context.language))) {
      return {
        suggestions: [],
        consentRequired: true,
        consentFeature: 'suggestions',
        consentCategories: AI_CONSENT_CATEGORIES,
      };
    }

    const provider = getProvider(configuredProvider.provider);

    try {
      const signal = AbortSignal.timeout(30000);
      const result = await getActivitySuggestions(provider, providerConfig, context, signal);
      return result;
    } catch (err) {
      logger.warn(`AI suggestions failed for provider ${configuredProvider.provider}`, {
        errorType: err instanceof Error ? err.name : 'unknown',
      });
      return { suggestions: [] };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AI_AUTO_FILL_PARAMS, async (event, request: AiAutoFillRequest) => {
    validateIPCPayload(event, 'ai:autoFillParams', request);

    const providerStatuses = await getProviderStatuses();
    const configuredProvider = providerStatuses.find(p => p.configured);
    if (!configuredProvider) {
      return { suggestions: {} };
    }

    const providerConfig = getProviderConfig(configuredProvider.provider);
    if (!providerConfig) {
      return { suggestions: {} };
    }

    if (!(await ensureAiConsent(ctx, 'auto-fill', configuredProvider.provider, providerConfig.baseUrl, request.language))) {
      return {
        suggestions: {},
        consentRequired: true,
        consentFeature: 'auto-fill',
        consentCategories: AI_CONSENT_CATEGORIES,
      };
    }

    try {
      const result = await autoFillParams(request, providerConfig);
      return result;
    } catch (err) {
      logger.warn(`AI param fill failed for ${request.activityName}`, {
        errorType: err instanceof Error ? err.name : 'unknown',
      });
      return { suggestions: {} };
    }
  });
}
