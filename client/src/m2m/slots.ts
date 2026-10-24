/** Escolhas do pacote de animações padrão (Mesh2Motion), sem carregar a biblioteca. */
/** Nome do arquivo gravado para o Companion (o anterior é trocado a cada gravação). */
export const STANDARD_PREFIX = 'padrao-m2m';
/** "Arquivo" virtual dos clipes convertidos ainda não gravados (aparece assim nas listas do Administrador). */
export const STANDARD_VIRTUAL = 'Mesh2Motion';

/** Clipe da biblioteca para cada papel do Companion (dá para trocar no Administrador). */
export const STANDARD_SLOTS: Record<string, string> = {
  idle: 'Idle_A',
  walk: 'Walk',
  run: 'Jog',
  sit: 'Meditate', // sentado no chão; com o banco, "Sitting_Idle"
  attack: 'Punch_Cross',
  'attack:espada': 'Sword_Attack',
  'attack:faca': 'Sword_Regular_B',
  'attack:maca': 'Sword_Regular_C',
  shoot: 'Bow',
  cast: 'Two-hand Blast',
  'attack:magia': 'Spell_Simple_Shoot',
  fidget: 'Idle_ShakeOff',
  pickup: 'PickUp_Table',
  mine: 'Chop_Tree',
  gather: 'Farm_Harvest',
  chop: 'Chop_Tree',
  jump: 'Jump_2',
  faint: 'Death_A',
  happy: 'Victory',
  block: 'Defend',
};
/** Vão junto no arquivo do jogo (conversas e encontros entre Companions). */
export const STANDARD_EXTRAS = ['Greeting', 'Idle_Talking', 'Head Nod'];

