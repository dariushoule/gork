export type MonsterTier = "normal" | "miniboss" | "boss";
export type LootTier = "mundane" | "special" | "exotic";
export type CampaignStatus = "active" | "completed";

export interface Campaign {
  id: number;
  title: string;
  description: string;
  thread_id: string | null;
  status: CampaignStatus;
  created_at: number;
  completed_at: number | null;
}

export interface Monster {
  id: number;
  campaign_id: number;
  name: string;
  tier: MonsterTier;
  hp: number;
  position: number;
  defeated: boolean;
  defeated_at: number | null;
}

export interface Player {
  id: number;
  discord_id: string;
  display_name: string;
  hp: number;
  incapacitated_until: number | null;
  incapacitation_reason: string | null;
  created_at: number;
}

export interface InventoryItem {
  id: number;
  player_id: number;
  name: string;
  tier: LootTier;
  acquired_at: number;
}

export interface LootDrop {
  id: number;
  monster_id: number;
  name: string;
  tier: LootTier;
  awarded_to: number | null;
}

export interface TurnHistoryEntry {
  id: number;
  campaign_id: number;
  player_name: string;
  player_action: string;
  gm_narrative: string;
  turn_number: number;
  created_at: number;
}

export interface GeneratedMonster {
  name: string;
  tier: MonsterTier;
}

export interface GeneratedLoot {
  name: string;
  tier: LootTier;
}

export interface TurnRoll {
  value: number;
  descriptor: string;
}

export interface TurnContext {
  campaign: { id: number; title: string; description: string };
  monster: { id: number; name: string; tier: MonsterTier; hp: number };
  monstersRemaining: number;
  player: {
    id: number;
    name: string;
    hp: number;
    inventory: Array<{ id: number; name: string; tier: LootTier }>;
    statusEffects: string[];
  };
  allParticipants: Array<{ name: string; hp: number; statusEffects: string[] }>;
  turnHistory: TurnHistoryEntry[];
  rolls: TurnRoll[];
  playerAction: string;
  nextMonsterName: string | null;
}

export interface AllyEffect {
  playerName: string;
  hpDelta: number;
  statusEffectsAdded: string[];
  statusEffectsRemoved: string[];
}

export interface TurnResult {
  narrative: string;
  monsterHpDelta: number;
  playerHpDelta: number;
  allyEffects: AllyEffect[];
  itemsConsumed: number[];
  incapacitationDurationMs: number;
  incapacitationReason: string;
  statusEffectsAdded: string[];
  statusEffectsRemoved: string[];
  unclearAction: boolean;
}
