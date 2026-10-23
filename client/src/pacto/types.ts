/** O que o servidor (ou o modo offline simulado) devolve sobre o Pacto das Cinco. */
import type { Element, MarkConfig, OrderRequirements, PactoConfig, Rarity, SpeciesKey, AttrKey, ForgePlan, ArtisanSignature } from '@rules';

export interface EquipmentView {
  id: string; blueprint: string; kind: 'equipamento' | 'ferramenta'; tool: string | null; durability: number; maxDurability: number; createdAt: string;
  name?: string; itemType?: string | null; stats?: Partial<Record<AttrKey, number>>; weight?: 'leve' | 'medio' | 'pesado'; affinity?: Element | null; mark?: MarkConfig | null; rarity?: Rarity;
  layers?: { corpo: string[]; trama: string[]; marca: string[]; tempera: string[] }; consumed?: { key: string; qty: number }[]; plan?: ForgePlan;
  signature?: ArtisanSignature & { contributors: { office: string; maker: string; component: string; name?: string }[] }; history?: { at: string; what: string }[];
}
export interface JobView { request: string; kind: 'forja' | 'oficio'; ref: string; order: string | null; startedAt: number; seconds: number }
export interface OrderView {
  id: string; client: string; artisan: string | null; blueprint: string; requirements: OrderRequirements; deposit: { key: string; qty: number }[];
  substitutions: boolean; payment: number; deadline: string; status: 'aberta' | 'aceita' | 'em_forja' | 'entregue' | 'cancelada' | 'expirada';
  history: { at: string; what: string; by?: string }[]; item: string | null; created_at: string;
}
export interface BoardView { id: string; companion_id: string; kind: 'oportunidade' | 'servico'; text: string; node_id: string | null; created_at: string }
export interface PactoView {
  serverNow: number;
  me: string;
  lumes: number;
  cls: { real: SpeciesKey | null; effective: SpeciesKey | null; test: SpeciesKey | null; essence: Element | null; admin: boolean; forms?: SpeciesKey[]; essences?: Element[]; lineage?: { forms: SpeciesKey[]; essences: Element[] } };
  equipment: EquipmentView[];
  jobs: JobView[];
  orders: { open: OrderView[]; mine: OrderView[] };
  board: BoardView[];
  names: Record<string, { name: string; cls: SpeciesKey | null }>;
  config: PactoConfig;
  simulated?: boolean;
}
export interface PactoReply {
  pacto?: PactoView;
  started?: { request: string; seconds: number; fee?: number };
  job?: { ok: boolean; wait?: number; kind?: string; label?: string; repeat?: boolean; equipment?: string | null };
  delivered?: boolean;
  cancelled?: { toClient: number; toArtisan: number };
  repaired?: number;
  recycled?: { key: string; qty: number }[];
  reforged?: boolean;
}
