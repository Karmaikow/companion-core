/**
 * Adiciona 23 armas ao catálogo (Arsenal) usando os modelos GLB existentes.
 * Roda: node scripts/add-arsenal-items.mjs
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://rqdukyenuecrshzmofdo.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não definida.');
  console.error('   Crie um arquivo .env.local com:');
  console.error('   VITE_SUPABASE_URL=https://rqdukyenuecrshzmofdo.supabase.co');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const MODELS = {
  espada: ['/models/armas/Sword.glb', '/models/armas/Sword_2.glb', '/models/armas/Sword_Big.glb', '/models/armas/Sword_Golden.glb', '/models/armas/Claymore.glb'],
  faca: ['/models/armas/Dagger.glb', '/models/armas/Dagger_2.glb'],
  maca: ['/models/armas/Hammer_Small.glb', '/models/armas/Hammer_Double.glb', '/models/armas/Axe.glb', '/models/armas/Axe_Small.glb', '/models/armas/Axe_Double.glb'],
  lanca: ['/models/armas/Spear.glb', '/models/armas/Scythe.glb'],
  cajado: [],
  varinha: [],
  arco: ['/models/armas/Bow_Wooden.glb', '/models/armas/Bow_Wooden2.glb', '/models/armas/Bow_Golden.glb', '/models/armas/Bow_Evil.glb'],
  escudo: ['/models/armas/Shield_Round.glb', '/models/armas/Shield_Round_2.glb', '/models/armas/Shield_Heater.glb', '/models/armas/Shield_Heater_2.glb', '/models/armas/Shield_Celtic_Golden.glb'],
  grimorio: [],
  orbe: [],
};

const WEAPON_ITEMS = [
  // Espadas (5)
  { slug: 'espada-de-ferro', name: 'Espada de Ferro', type: 'espada', rarity: 'comum', stats: { poder: 5 }, model: 0, description: 'A espada básica do aventureiro.', recipe: [['Fragmento de Bruma', 3], ['Musgo macio', 2]], minBond: 2 },
  { slug: 'espada-prateada', name: 'Espada Prateada', type: 'espada', rarity: 'incomum', stats: { poder: 7 }, model: 1, essence: 'luz', description: 'Brilha fraco contra criaturas das trevas.', recipe: [['Fragmento de Bruma', 5], ['Cristal de geada', 1]], minBond: 4 },
  { slug: 'claymore-ancestral', name: 'Claymore Ancestral', type: 'espada', rarity: 'rara', stats: { poder: 10 }, model: 4, twoHanded: true, description: 'Uma espada de duas mãos pesada e cerimonial.', recipe: [['Fragmento de Bruma', 8], ['Cerne de salgueiro', 2]], minBond: 6 },
  { slug: 'espada-dourada', name: 'Espada Dourada', type: 'espada', rarity: 'rara', stats: { poder: 9, agilidade: 1 }, model: 3, essence: 'fogo', description: 'O metal parece queimar na bainha.', recipe: [['Po de brasa', 4], ['Semente brilhante', 2]], minBond: 7 },
  { slug: 'espada-do-crepusculo', name: 'Espada do Crepusculo', type: 'espada', rarity: 'lendaria', stats: { poder: 12, sintonia: 2 }, model: 2, essence: 'sombra', description: 'Corta a luz e a sombra igualmente.', recipe: [['Nucleo fendido', 1], ['Lasca rachada', 5], ['Po prismatico', 3]], minBond: 10 },

  // Facas (4)
  { slug: 'adaga-de-osse', name: 'Adaga de Osso', type: 'faca', rarity: 'comum', stats: { agilidade: 3 }, model: 0, description: 'Leve, feita de osso polido.', recipe: [['Fragmento de Bruma', 2], ['Pelo gelado', 1]], minBond: 1 },
  { slug: 'adaga-venenosa', name: 'Adaga Venenosa', type: 'faca', rarity: 'incomum', stats: { agilidade: 4, poder: 2 }, model: 1, essence: 'veneno', description: 'A lamina goteja toxina.', recipe: [['Fragmento de Bruma', 4], ['Po de brasa', 2]], minBond: 3 },
  { slug: 'adaga-sombria', name: 'Adaga Sombria', type: 'faca', rarity: 'rara', stats: { agilidade: 6, sintonia: 1 }, model: 0, essence: 'sombra', description: 'Some na mao de quem a empunha.', recipe: [['Lasca rachada', 2], ['Po prismatico', 1]], minBond: 5 },
  { slug: 'adaga-das-estrelas', name: 'Adaga das Estrelas', type: 'faca', rarity: 'rara', stats: { agilidade: 5, energia: 3 }, model: 1, essence: 'luz', description: 'Brilha quando monstros estao perto.', recipe: [['Semente brilhante', 3], ['Cristal de geada', 1]], minBond: 6 },

  // Macas (3)
  { slug: 'maca-de-ferro', name: 'Maca de Ferro', type: 'maca', rarity: 'comum', stats: { poder: 7 }, model: 0, description: 'Pesada e sem enfeites.', recipe: [['Fragmento de Bruma', 5], ['Musgo macio', 2]], minBond: 3 },
  { slug: 'martelo-de-guerra', name: 'Martelo de Guerra', type: 'maca', rarity: 'incomum', stats: { poder: 9 }, model: 2, twoHanded: true, description: 'Requer duas maos, quebra escudos.', recipe: [['Fragmento de Bruma', 7], ['Cerne de salgueiro', 1]], minBond: 5 },
  { slug: 'maca-do-trovao', name: 'Maca do Trovao', type: 'maca', rarity: 'rara', stats: { poder: 11 }, model: 1, essence: 'raio', description: 'Estala com energia a cada golpe.', recipe: [['Po de brasa', 3], ['Cristal de geada', 2]], minBond: 7 },

  // Lancas (4)
  { slug: 'lanca-de-madeira', name: 'Lanca de Madeira', type: 'lanca', rarity: 'comum', stats: { poder: 4, agilidade: 1 }, model: 0, twoHanded: true, description: 'Simples, mas com bom alcance.', recipe: [['Fragmento de Bruma', 2], ['Musgo macio', 3]], minBond: 2 },
  { slug: 'lanca-de-ferro', name: 'Lanca de Ferro', type: 'lanca', rarity: 'incomum', stats: { poder: 6, agilidade: 2 }, model: 0, twoHanded: true, description: 'A ponta atravessa couro grosso.', recipe: [['Fragmento de Bruma', 4], ['Pelo gelado', 2]], minBond: 4 },
  { slug: 'foice-da-colheita', name: 'Foice da Colheita', type: 'lanca', rarity: 'rara', stats: { poder: 8, sintonia: 2 }, model: 1, twoHanded: true, essence: 'natureza', description: 'Corta a vida e a morte.', recipe: [['Cerne ancestral', 1], ['Semente brilhante', 2]], minBond: 6 },
  { slug: 'lanca-dragao', name: 'Lanca do Dragao', type: 'lanca', rarity: 'rara', stats: { poder: 10 }, model: 0, twoHanded: true, essence: 'fogo', description: 'A ponta brasa por dentro.', recipe: [['Po de brasa', 5], ['Cerne de salgueiro', 2]], minBond: 8 },

  // Cajados (3)
  { slug: 'cajado-de-carvalho', name: 'Cajado de Carvalho', type: 'cajado', rarity: 'comum', stats: { sintonia: 4 }, model: null, twoHanded: true, description: 'Um galho grosso que ainda brota folhas.', recipe: [['Fragmento de Bruma', 3], ['Semente brilhante', 1]], minBond: 2 },
  { slug: 'cajado-da-mare', name: 'Cajado da Mare', type: 'cajado', rarity: 'incomum', stats: { sintonia: 6, energia: 2 }, model: null, twoHanded: true, essence: 'agua', description: 'A ponta balanca como agua.', recipe: [['Fragmento de Bruma', 5], ['Cristal de geada', 1]], minBond: 4 },
  { slug: 'cajado-do-arquimago', name: 'Cajado do Arquimago', type: 'cajado', rarity: 'rara', stats: { sintonia: 9, poder: 2 }, model: null, twoHanded: true, essence: 'arcano', description: 'Requer matricula na Escola Arcana.', recipe: [['Nucleo fendido', 1], ['Po prismatico', 3]], minBond: 8 },

  // Varinha (3)
  { slug: 'varinha-de-cristal', name: 'Varinha de Cristal', type: 'varinha', rarity: 'comum', stats: { sintonia: 3, energia: 2 }, model: null, description: 'Pequena, cabe no bolso.', recipe: [['Fragmento de Bruma', 2], ['Cristal de geada', 1]], minBond: 2 },
  { slug: 'varinha-do-vento', name: 'Varinha do Vento', type: 'varinha', rarity: 'incomum', stats: { sintonia: 5, agilidade: 2 }, model: null, essence: 'vento', description: 'Sopra uma brisa ao lancar.', recipe: [['Po de brasa', 2], ['Pelo gelado', 2]], minBond: 4 },
  { slug: 'varinha-do-vazio', name: 'Varinha do Vazio', type: 'varinha', rarity: 'rara', stats: { sintonia: 7, energia: 4 }, model: null, essence: 'sombra', description: 'Engole a luz ao redor.', recipe: [['Lasca rachada', 3], ['Po prismatico', 2]], minBond: 7 },

  // Arcos (4)
  { slug: 'arco-longo', name: 'Arco Longo', type: 'arco', rarity: 'comum', stats: { agilidade: 3, poder: 3 }, model: 0, twoHanded: true, description: 'Mais alcance que o curto.', recipe: [['Fragmento de Bruma', 4], ['Pelo gelado', 3]], minBond: 3 },
  { slug: 'arco-composto', name: 'Arco Composto', type: 'arco', rarity: 'incomum', stats: { agilidade: 4, poder: 5 }, model: 1, twoHanded: true, description: 'Carrega mais rapido e bate mais forte.', recipe: [['Fragmento de Bruma', 6], ['Cerne de salgueiro', 1]], minBond: 5 },
  { slug: 'arco-dourado', name: 'Arco Dourado', type: 'arco', rarity: 'rara', stats: { agilidade: 5, poder: 7 }, model: 2, twoHanded: true, essence: 'luz', description: 'Flechas deixam rastros de luz.', recipe: [['Semente brilhante', 3], ['Po de brasa', 2]], minBond: 7 },
  { slug: 'arco-maldito', name: 'Arco Maldito', type: 'arco', rarity: 'rara', stats: { agilidade: 6, poder: 6 }, model: 3, twoHanded: true, essence: 'sombra', description: 'Sussurra ao ser esticado.', recipe: [['Lasca rachada', 2], ['Nucleo fendido', 1]], minBond: 8 },

  // Escudos (4)
  { slug: 'escudo-redondo', name: 'Escudo Redondo', type: 'escudo', rarity: 'comum', stats: { defesa: 5 }, model: 0, description: 'Leve, bom para desviar.', recipe: [['Fragmento de Bruma', 3], ['Musgo macio', 3]], minBond: 2 },
  { slug: 'escudo-de-torre', name: 'Escudo de Torre', type: 'escudo', rarity: 'incomum', stats: { defesa: 8 }, model: 2, description: 'Grande, cobre o corpo todo.', recipe: [['Fragmento de Bruma', 6], ['Cerne de salgueiro', 2]], minBond: 5 },
  { slug: 'escudo-celta', name: 'Escudo Celta', type: 'escudo', rarity: 'rara', stats: { defesa: 10, sintonia: 1 }, model: 4, essence: 'terra', description: 'Runas antigas brilham na madeira.', recipe: [['Cerne ancestral', 1], ['Fragmento de Bruma', 5]], minBond: 7 },
  { slug: 'escudo-da-fe', name: 'Escudo da Fe', type: 'escudo', rarity: 'rara', stats: { defesa: 9, vida: 3 }, model: 3, essence: 'luz', description: 'Protege aliados ao redor.', recipe: [['Semente brilhante', 4], ['Cristal de geada', 2]], minBond: 7 },

  // Grimorios (2)
  { slug: 'grimorio-das-sombras', name: 'Grimorio das Sombras', type: 'grimorio', rarity: 'incomum', stats: { sintonia: 5 }, model: null, essence: 'sombra', description: 'Paginas viram sozinhas.', recipe: [['Lasca rachada', 2], ['Fragmento de Bruma', 4]], minBond: 4 },
  { slug: 'grimorio-do-fogo', name: 'Grimorio do Fogo', type: 'grimorio', rarity: 'rara', stats: { sintonia: 7, poder: 2 }, model: null, essence: 'fogo', description: 'Queima as maos de quem nao sabe ler.', recipe: [['Po de brasa', 5], ['Nucleo fendido', 1]], minBond: 6 },

  // Orbes (2)
  { slug: 'orbe-da-claridade', name: 'Orbe da Claridade', type: 'orbe', rarity: 'incomum', stats: { energia: 5, sintonia: 2 }, model: null, essence: 'luz', description: 'Flutua e ilumina segredos.', recipe: [['Semente brilhante', 3], ['Fragmento de Bruma', 3]], minBond: 4 },
  { slug: 'orbe-do-abismo', name: 'Orbe do Abismo', type: 'orbe', rarity: 'rara', stats: { energia: 7, sintonia: 3 }, model: null, essence: 'sombra', description: 'Mostra o que nao devia ser visto.', recipe: [['Lasca rachada', 3], ['Po prismatico', 2]], minBond: 7 },
];

async function main() {
  console.log(`Inserindo ${WEAPON_ITEMS.length} itens no Arsenal...`);

  let inserted = 0, skipped = 0;

  for (const item of WEAPON_ITEMS) {
    const { slug, name, type, rarity, stats, model, twoHanded, essence, description, recipe, minBond } = item;

    // Verificar se ja existe
    const { data: existing } = await supabase
      .from('items')
      .select('slug')
      .eq('slug', slug)
      .single();

    if (existing) {
      console.log(`  -> ${slug} ja existe`);
      skipped++;
      continue;
    }

    // Montar o item
    const modelUrl = model !== null && MODELS[type]?.[model] ? MODELS[type][model] : undefined;

    const itemData = {
      slug,
      name,
      data: {
        type,
        rarity,
        essence: essence || null,
        stats: stats || {},
        weight: 0,
        description,
        model: modelUrl ? { url: modelUrl } : undefined,
        recipe: {
          ingredients: recipe.map(([item, qty]) => ({ item, qty })),
          minBond: minBond || 2,
          seconds: 30
        },
        obtain: 'Forja (Taurina)'
      },
      status: 'published',
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from('items').insert(itemData);

    if (error) {
      console.error(`  X ${slug}: ${error.message}`);
    } else {
      console.log(`  + ${slug} (${rarity})${modelUrl ? ` - ${modelUrl}` : ''}`);
      inserted++;
    }
  }

  console.log(`\nFeito: ${inserted} inseridos, ${skipped} ja existiam.`);
}

main().catch(console.error);