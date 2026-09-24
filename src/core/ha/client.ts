/**
 * Home-Assistant-Client: holt die Entity-Liste über die REST-API.
 *   GET <baseUrl>/api/states   (Header: Authorization: Bearer <token>)
 *
 * `fetch` kann – anders als WebSocket – den Authorization-Header setzen.
 * Die Extension umgeht CORS zur HA-Instanz per Host-Permissions.
 */

import { tr } from '@/shared/i18n';

export interface HaEntity {
  entity_id: string;
  /** Domain-Teil, z. B. 'light', 'sensor'. */
  domain: string;
  friendly_name?: string;
  state?: string;
  /** Relevante numerische Attribute (percentage/brightness/current_position/volume_level). */
  attributes?: Record<string, unknown>;
}

interface RawState {
  entity_id: string;
  state?: string;
  attributes?: { friendly_name?: string; [k: string]: unknown };
}

type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const HA_TIMEOUT_MS = 8000;

export async function fetchEntities(
  baseUrl: string,
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<HaEntity[]> {
  const url = baseUrl.replace(/\/+$/, '') + '/api/states';
  // Ohne Timeout hängt die UI bei nicht erreichbarem Host bis zum TCP-Timeout des Systems (~20 s+).
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(HA_TIMEOUT_MS),
  }).catch((e: unknown) => {
    if ((e as Error)?.name === 'TimeoutError') throw new Error(tr('err_ha_timeout', { url: baseUrl }));
    throw e;
  });
  if (!res.ok) throw new Error(`HA ${url} → HTTP ${res.status}`);
  const data = (await res.json()) as RawState[];
  if (!Array.isArray(data)) throw new Error(tr('err_ha_unexpected'));
  return data
    .map((s) => ({
      entity_id: s.entity_id,
      domain: s.entity_id.includes('.') ? s.entity_id.split('.')[0] : '',
      friendly_name: s.attributes?.friendly_name,
      state: s.state,
      attributes: s.attributes,
    }))
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
}
