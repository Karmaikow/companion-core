/**
 * Adiciona 4 biomas no Supabase usando modelos do Quaternius Nature MegaKit.
 * Roda: node scripts/add-biomes.mjs
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://rqdukyenuecrshzmofdo.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY nao definida no .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BIOMES = [
  {
    slug: 'bosque-dos-pinheiros',
    name: 'Bosque dos Pinheiros',
    description: 'Pinheiros altos e retos, chão de agulhas, ar fresco de resina.',
    kind: 'world',
    palette: {
      grassLight: '#7ab85a',
      grassDark: '#4a8a3a',
      dirt: '#8b6b4a',
      dirtDark: '#5a422a',
      rockSide: '#9a8a7a',
      rockTop: '#7ab85a',
      rockBottom: '#6a5a4a',
      sky: '#b8e0ff',
      fog: '#d0e8fc',
      skyNight: '#2a3a5a',
      fogNight: '#2a3a5a',
    },
    settings: {
      kind: 'world',
      grassBlades: 1,
      cliffs: false,
      world: true,
      ambient: 'none',
      fog: 1,
      hills: 1.2,
      weather: { sol: 5, chuva: 1, nevoa: 1, tempestade: 0.3, neve: 0.2 },
      resources: [
        { kind: 'carvalho', density: 0.35, time: 'sempre', weather: [], terrain: 'mata' },
        { kind: 'salgueiro', density: 0.15, time: 'sempre', weather: [], terrain: 'aberto' },
        { kind: 'granito', density: 0.2, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'cascalho', density: 0.1, time: 'sempre', weather: [], terrain: 'aberto' },
        { kind: 'cobre', density: 0.06, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'geodo', density: 0.03, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'salgueiro-antigo', density: 0.015, time: 'sempre', weather: [], terrain: 'mata', unlock: 'variedade:salgueiro-antigo' },
        { kind: 'liquen-dos-ventos', density: 0.02, time: 'sempre', weather: [], terrain: 'aberto' },
        { kind: 'pedra-inscrita', density: 0.02, time: 'noite', weather: [], terrain: 'qualquer' },
        { kind: 'erva-lunar', density: 0.08, time: 'sempre', weather: [], terrain: 'qualquer', unlock: 'variedade:erva-lunar' },
        { kind: 'veio-prateado', density: 0.04, time: 'sempre', weather: [], terrain: 'qualquer', unlock: 'variedade:veio-prateado' },
        { kind: 'nascente-azul', density: 0.008, time: 'sempre', weather: [], terrain: 'aberto', unlock: 'lendaria:nascente-azul' },
        { kind: 'arvore-ancestral', density: 0.006, time: 'sempre', weather: [], terrain: 'mata', unlock: 'lendaria:arvore-ancestral' },
      ],
    },
    assets: [
      { id: 'pinheiro-1', name: 'Pinheiro 1', url: '/assets/natureza/Pine_1.glb', role: 'tree', zone: 'outside', height: [4, 6], count: 18, wind: 0.35 },
      { id: 'pinheiro-2', name: 'Pinheiro 2', url: '/assets/natureza/Pine_2.glb', role: 'tree', zone: 'outside', height: [3.5, 5.5], count: 16, wind: 0.35 },
      { id: 'pinheiro-3', name: 'Pinheiro 3', url: '/assets/natureza/Pine_3.glb', role: 'tree', zone: 'outside', height: [3, 5], count: 14, wind: 0.35 },
      { id: 'pinheiro-4', name: 'Pinheiro 4', url: '/assets/natureza/Pine_4.glb', role: 'tree', zone: 'outside', height: [4.5, 6.5], count: 12, wind: 0.35 },
      { id: 'pinheiro-5', name: 'Pinheiro 5', url: '/assets/natureza/Pine_5.glb', role: 'tree', zone: 'outside', height: [2.8, 4.5], count: 10, wind: 0.35 },
      { id: 'arvore-torta-1', name: 'Árvore Torta 1', url: '/assets/natureza/TwistedTree_1.glb', role: 'tree', zone: 'outside', height: [3, 5], count: 8, wind: 0.35 },
      { id: 'arvore-torta-2', name: 'Árvore Torta 2', url: '/assets/natureza/TwistedTree_2.glb', role: 'tree', zone: 'outside', height: [2.5, 4], count: 6, wind: 0.35 },
      { id: 'arbusto-comum', name: 'Arbusto Comum', url: '/assets/natureza/Bush_Common.glb', role: 'plant', zone: 'inside', height: [0.5, 1.2], count: 35, wind: 0.5 },
      { id: 'arbusto-flores', name: 'Arbusto com Flores', url: '/assets/natureza/Bush_Common_Flowers.glb', role: 'plant', zone: 'inside', height: [0.6, 1.3], count: 20, wind: 0.5 },
      { id: 'samambaia', name: 'Samambaia', url: '/assets/natureza/Fern_1.glb', role: 'plant', zone: 'inside', height: [0.4, 0.9], count: 40, wind: 0.7 },
      { id: 'pedra-media-1', name: 'Pedra Média 1', url: '/assets/natureza/Rock_Medium_1.glb', role: 'rock', zone: 'edge', height: [0.8, 1.6], count: 12, wind: 0 },
      { id: 'pedra-media-2', name: 'Pedra Média 2', url: '/assets/natureza/Rock_Medium_2.glb', role: 'rock', zone: 'edge', height: [0.7, 1.5], count: 10, wind: 0 },
      { id: 'pedra-media-3', name: 'Pedra Média 3', url: '/assets/natureza/Rock_Medium_3.glb', role: 'rock', zone: 'edge', height: [0.6, 1.4], count: 8, wind: 0 },
      { id: 'seixo-1', name: 'Seixo 1', url: '/assets/natureza/Pebble_Round_1.glb', role: 'prop', zone: 'inside', height: [0.1, 0.2], count: 20, wind: 0 },
      { id: 'seixo-2', name: 'Seixo 2', url: '/assets/natureza/Pebble_Round_2.glb', role: 'prop', zone: 'inside', height: [0.1, 0.2], count: 18, wind: 0 },
      { id: 'grama-curta', name: 'Grama Curta', url: '/assets/natureza/Grass_Common_Short.glb', role: 'grass', zone: 'inside', height: [0.08, 0.15], count: 180, wind: 1 },
      { id: 'grama-alta', name: 'Grama Alta', url: '/assets/natureza/Grass_Common_Tall.glb', role: 'grass', zone: 'edge', height: [0.15, 0.3], count: 60, wind: 1 },
    ],
  },
  {
    slug: 'floresta-de-outono',
    name: 'Floresta de Outono',
    description: 'Folhas douradas e avermelhadas, chão forrado de cores quentes.',
    kind: 'world',
    palette: {
      grassLight: '#c9a84a',
      grassDark: '#9a7a3a',
      dirt: '#b88a5a',
      dirtDark: '#8a6540',
      rockSide: '#b09070',
      rockTop: '#c9a84a',
      rockBottom: '#8a7050',
      sky: '#ffe8c0',
      fog: '#ffe8c0',
      skyNight: '#4a3a2a',
      fogNight: '#4a3a2a',
    },
    settings: {
      kind: 'world',
      grassBlades: 1,
      cliffs: false,
      world: true,
      ambient: 'leaves',
      fog: 1,
      hills: 1.0,
      weather: { sol: 4, chuva: 2, nevoa: 2, tempestade: 0.5, neve: 0 },
      resources: [
        { kind: 'carvalho', density: 0.4, time: 'sempre', weather: [], terrain: 'mata' },
        { kind: 'salgueiro', density: 0.2, time: 'sempre', weather: [], terrain: 'aberto' },
        { kind: 'erva', density: 0.5, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'granito', density: 0.15, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'cascalho', density: 0.12, time: 'sempre', weather: [], terrain: 'aberto' },
        { kind: 'cobre', density: 0.08, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'geodo', density: 0.04, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'salgueiro-antigo', density: 0.025, time: 'sempre', weather: [], terrain: 'mata', unlock: 'variedade:salgueiro-antigo' },
        { kind: 'remanso-profundo', density: 0.025, time: 'sempre', weather: ['chuva', 'tempestade'], terrain: 'qualquer' },
        { kind: 'erva-lunar', density: 0.1, time: 'sempre', weather: [], terrain: 'qualquer', unlock: 'variedade:erva-lunar' },
        { kind: 'veio-prateado', density: 0.05, time: 'sempre', weather: [], terrain: 'qualquer', unlock: 'variedade:veio-prateado' },
        { kind: 'nascente-azul', density: 0.01, time: 'sempre', weather: [], terrain: 'aberto', unlock: 'lendaria:nascente-azul' },
        { kind: 'arvore-ancestral', density: 0.008, time: 'sempre', weather: [], terrain: 'mata', unlock: 'lendaria:arvore-ancestral' },
      ],
    },
    assets: [
      { id: 'arvore-comum-1', name: 'Árvore Comum 1', url: '/assets/natureza/CommonTree_1.glb', role: 'tree', zone: 'outside', height: [3.5, 5.5], count: 16, wind: 0.35 },
      { id: 'arvore-comum-2', name: 'Árvore Comum 2', url: '/assets/natureza/CommonTree_2.glb', role: 'tree', zone: 'outside', height: [3, 5], count: 14, wind: 0.35 },
      { id: 'arvore-comum-3', name: 'Árvore Comum 3', url: '/assets/natureza/CommonTree_3.glb', role: 'tree', zone: 'outside', height: [2.8, 4.5], count: 12, wind: 0.35 },
      { id: 'arvore-comum-4', name: 'Árvore Comum 4', url: '/assets/natureza/CommonTree_4.glb', role: 'tree', zone: 'outside', height: [3.2, 5.2], count: 10, wind: 0.35 },
      { id: 'arvore-comum-5', name: 'Árvore Comum 5', url: '/assets/natureza/CommonTree_5.glb', role: 'tree', zone: 'outside', height: [2.5, 4], count: 8, wind: 0.35 },
      { id: 'arvore-torta-3', name: 'Árvore Torta 3', url: '/assets/natureza/TwistedTree_3.glb', role: 'tree', zone: 'outside', height: [3, 5], count: 6, wind: 0.35 },
      { id: 'arvore-torta-4', name: 'Árvore Torta 4', url: '/assets/natureza/TwistedTree_4.glb', role: 'tree', zone: 'outside', height: [2.8, 4.8], count: 5, wind: 0.35 },
      { id: 'arvore-torta-5', name: 'Árvore Torta 5', url: '/assets/natureza/TwistedTree_5.glb', role: 'tree', zone: 'outside', height: [3.5, 5.5], count: 4, wind: 0.35 },
      { id: 'arbusto-comum-2', name: 'Arbusto Comum', url: '/assets/natureza/Bush_Common.glb', role: 'plant', zone: 'inside', height: [0.5, 1.2], count: 40, wind: 0.5 },
      { id: 'arbusto-flores-2', name: 'Arbusto com Flores', url: '/assets/natureza/Bush_Common_Flowers.glb', role: 'plant', zone: 'inside', height: [0.6, 1.3], count: 25, wind: 0.5 },
      { id: 'planta-1', name: 'Planta 1', url: '/assets/natureza/Plant_1.glb', role: 'plant', zone: 'inside', height: [0.8, 1.5], count: 30, wind: 0.6 },
      { id: 'planta-7', name: 'Planta 7', url: '/assets/natureza/Plant_7.glb', role: 'plant', zone: 'inside', height: [0.7, 1.3], count: 25, wind: 0.6 },
      { id: 'trevo-1', name: 'Trevo 1', url: '/assets/natureza/Clover_1.glb', role: 'plant', zone: 'inside', height: [0.15, 0.3], count: 50, wind: 0.8 },
      { id: 'trevo-2', name: 'Trevo 2', url: '/assets/natureza/Clover_2.glb', role: 'plant', zone: 'inside', height: [0.15, 0.3], count: 45, wind: 0.8 },
      { id: 'cogumelo-comum', name: 'Cogumelo Comum', url: '/assets/natureza/Mushroom_Common.glb', role: 'plant', zone: 'inside', height: [0.2, 0.4], count: 20, wind: 0.2 },
      { id: 'cogumelo-laetiporus', name: 'Cogumelo Laetiporus', url: '/assets/natureza/Mushroom_Laetiporus.glb', role: 'plant', zone: 'inside', height: [0.3, 0.5], count: 12, wind: 0.1 },
      { id: 'pedra-media-1', name: 'Pedra Média 1', url: '/assets/natureza/Rock_Medium_1.glb', role: 'rock', zone: 'edge', height: [0.8, 1.6], count: 10, wind: 0 },
      { id: 'pedra-media-2', name: 'Pedra Média 2', url: '/assets/natureza/Rock_Medium_2.glb', role: 'rock', zone: 'edge', height: [0.7, 1.5], count: 8, wind: 0 },
      { id: 'seixo-3', name: 'Seixo 3', url: '/assets/natureza/Pebble_Round_3.glb', role: 'prop', zone: 'inside', height: [0.1, 0.2], count: 20, wind: 0 },
      { id: 'seixo-4', name: 'Seixo 4', url: '/assets/natureza/Pebble_Round_4.glb', role: 'prop', zone: 'inside', height: [0.1, 0.2], count: 18, wind: 0 },
      { id: 'grama-curta-2', name: 'Grama Curta', url: '/assets/natureza/Grass_Common_Short.glb', role: 'grass', zone: 'inside', height: [0.08, 0.15], count: 200, wind: 1 },
      { id: 'grama-alta-2', name: 'Grama Alta', url: '/assets/natureza/Grass_Common_Tall.glb', role: 'grass', zone: 'edge', height: [0.15, 0.3], count: 80, wind: 1 },
    ],
  },
  {
    slug: 'campo-florido',
    name: 'Campo Florido',
    description: 'Prados abertos cobertos de flores coloridas, brisa constante.',
    kind: 'world',
    palette: {
      grassLight: '#8fd86a',
      grassDark: '#5fa84c',
      dirt: '#d8c08a',
      dirtDark: '#b09a6a',
      rockSide: '#d0c8b8',
      rockTop: '#8fd86a',
      rockBottom: '#b8a898',
      sky: '#e8f8ff',
      fog: '#f0faff',
      skyNight: '#3a4a5a',
      fogNight: '#3a4a5a',
    },
    settings: {
      kind: 'world',
      grassBlades: 2,
      cliffs: false,
      world: true,
      ambient: 'petals',
      fog: 1,
      hills: 0.5,
      weather: { sol: 6, chuva: 1.5, nevoa: 0.5, tempestade: 0.2, neve: 0 },
      resources: [
        { kind: 'erva', density: 0.7, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'cascalho', density: 0.2, time: 'sempre', weather: [], terrain: 'aberto' },
        { kind: 'granito', density: 0.1, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'cobre', density: 0.06, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'geodo', density: 0.03, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'liquen-dos-ventos', density: 0.03, time: 'sempre', weather: [], terrain: 'aberto' },
        { kind: 'erva-lunar', density: 0.15, time: 'sempre', weather: [], terrain: 'qualquer', unlock: 'variedade:erva-lunar' },
        { kind: 'remanso-profundo', density: 0.03, time: 'sempre', weather: ['chuva', 'tempestade'], terrain: 'qualquer' },
        { kind: 'pedra-inscrita', density: 0.025, time: 'noite', weather: [], terrain: 'qualquer' },
        { kind: 'nascente-azul', density: 0.012, time: 'sempre', weather: [], terrain: 'aberto', unlock: 'lendaria:nascente-azul' },
        { kind: 'arvore-ancestral', density: 0.005, time: 'sempre', weather: [], terrain: 'mata', unlock: 'lendaria:arvore-ancestral' },
      ],
    },
    assets: [
      { id: 'flor-grupo-3', name: 'Flores Grupo 3', url: '/assets/natureza/Flower_3_Group.glb', role: 'plant', zone: 'inside', height: [0.4, 0.8], count: 60, wind: 0.8 },
      { id: 'flor-unica-3', name: 'Flor Única 3', url: '/assets/natureza/Flower_3_Single.glb', role: 'plant', zone: 'inside', height: [0.3, 0.6], count: 50, wind: 0.8 },
      { id: 'flor-grupo-4', name: 'Flores Grupo 4', url: '/assets/natureza/Flower_4_Group.glb', role: 'plant', zone: 'inside', height: [0.5, 0.9], count: 50, wind: 0.8 },
      { id: 'flor-unica-4', name: 'Flor Única 4', url: '/assets/natureza/Flower_4_Single.glb', role: 'plant', zone: 'inside', height: [0.4, 0.7], count: 40, wind: 0.8 },
      { id: 'petala-1', name: 'Pétala 1', url: '/assets/natureza/Petal_1.glb', role: 'plant', zone: 'inside', height: [0.1, 0.2], count: 40, wind: 1 },
      { id: 'petala-2', name: 'Pétala 2', url: '/assets/natureza/Petal_2.glb', role: 'plant', zone: 'inside', height: [0.1, 0.2], count: 35, wind: 1 },
      { id: 'petala-3', name: 'Pétala 3', url: '/assets/natureza/Petal_3.glb', role: 'plant', zone: 'inside', height: [0.1, 0.2], count: 30, wind: 1 },
      { id: 'planta-1-big', name: 'Planta 1 Grande', url: '/assets/natureza/Plant_1_Big.glb', role: 'plant', zone: 'inside', height: [1, 1.8], count: 25, wind: 0.6 },
      { id: 'planta-7-big', name: 'Planta 7 Grande', url: '/assets/natureza/Plant_7_Big.glb', role: 'plant', zone: 'inside', height: [0.9, 1.6], count: 20, wind: 0.6 },
      { id: 'arvore-comum-1', name: 'Árvore Comum 1 (isolada)', url: '/assets/natureza/CommonTree_1.glb', role: 'landmark', zone: 'edge', height: [4, 6], count: 3, wind: 0.35 },
      { id: 'arbusto-comum', name: 'Arbusto Comum', url: '/assets/natureza/Bush_Common.glb', role: 'plant', zone: 'inside', height: [0.5, 1.2], count: 20, wind: 0.5 },
      { id: 'caminho-pedra-1', name: 'Caminho Pedra Redonda 1', url: '/assets/natureza/RockPath_Round_Small_1.glb', role: 'prop', zone: 'inside', height: [0.05, 0.1], count: 15, wind: 0 },
      { id: 'caminho-pedra-2', name: 'Caminho Pedra Redonda 2', url: '/assets/natureza/RockPath_Round_Small_2.glb', role: 'prop', zone: 'inside', height: [0.05, 0.1], count: 12, wind: 0 },
      { id: 'pedra-media-3', name: 'Pedra Média 3', url: '/assets/natureza/Rock_Medium_3.glb', role: 'rock', zone: 'edge', height: [0.8, 1.6], count: 6, wind: 0 },
      { id: 'seixo-5', name: 'Seixo 5', url: '/assets/natureza/Pebble_Round_5.glb', role: 'prop', zone: 'inside', height: [0.1, 0.2], count: 25, wind: 0 },
      { id: 'seixo-quadrado-1', name: 'Seixo Quadrado 1', url: '/assets/natureza/Pebble_Square_1.glb', role: 'prop', zone: 'inside', height: [0.1, 0.2], count: 20, wind: 0 },
      { id: 'grama-curta', name: 'Grama Curta', url: '/assets/natureza/Grass_Common_Short.glb', role: 'grass', zone: 'inside', height: [0.08, 0.15], count: 250, wind: 1 },
      { id: 'grama-alta', name: 'Grama Alta', url: '/assets/natureza/Grass_Common_Tall.glb', role: 'grass', zone: 'inside', height: [0.15, 0.3], count: 100, wind: 1 },
      { id: 'grama-ondulada-curta', name: 'Grama Ondulada Curta', url: '/assets/natureza/Grass_Wispy_Short.glb', role: 'grass', zone: 'inside', height: [0.08, 0.15], count: 120, wind: 1.2 },
      { id: 'grama-ondulada-alta', name: 'Grama Ondulada Alta', url: '/assets/natureza/Grass_Wispy_Tall.glb', role: 'grass', zone: 'inside', height: [0.15, 0.3], count: 80, wind: 1.2 },
    ],
  },
  {
    slug: 'charneca-morta',
    name: 'Charneca Morta',
    description: 'Terra seca e rachada, árvores mortas, silêncio pesado. Perigo em cada passo.',
    kind: 'world',
    palette: {
      grassLight: '#5a5a4a',
      grassDark: '#3a3a30',
      dirt: '#6a5a4a',
      dirtDark: '#4a3a2a',
      rockSide: '#6a5a5a',
      rockTop: '#5a5a4a',
      rockBottom: '#4a3a3a',
      sky: '#3a3a4a',
      fog: '#2a2a3a',
      skyNight: '#1a1a2a',
      fogNight: '#1a1a2a',
    },
    settings: {
      kind: 'world',
      grassBlades: 0,
      cliffs: true,
      world: true,
      ambient: 'spores',
      fog: 2,
      hills: 1.5,
      weather: { sol: 2, chuva: 0.5, nevoa: 4, tempestade: 1, neve: 0.5 },
      resources: [
        { kind: 'carvalho', density: 0.1, time: 'sempre', weather: [], terrain: 'mata' },
        { kind: 'granito', density: 0.3, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'cascalho', density: 0.25, time: 'sempre', weather: [], terrain: 'aberto' },
        { kind: 'cobre', density: 0.1, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'geodo', density: 0.05, time: 'sempre', weather: [], terrain: 'qualquer' },
        { kind: 'veio-prateado', density: 0.08, time: 'sempre', weather: [], terrain: 'qualquer', unlock: 'variedade:veio-prateado' },
        { kind: 'pedra-inscrita', density: 0.04, time: 'noite', weather: [], terrain: 'qualquer' },
        { kind: 'liquen-dos-ventos', density: 0.02, time: 'sempre', weather: [], terrain: 'aberto' },
        { kind: 'arvore-morta-1', density: 0.15, time: 'sempre', weather: [], terrain: 'mata' },
        { kind: 'arvore-morta-2', density: 0.12, time: 'sempre', weather: [], terrain: 'mata' },
        { kind: 'arvore-morta-3', density: 0.1, time: 'sempre', weather: [], terrain: 'mata' },
        { kind: 'nascente-azul', density: 0.006, time: 'sempre', weather: [], terrain: 'aberto', unlock: 'lendaria:nascente-azul' },
        { kind: 'arvore-ancestral', density: 0.004, time: 'sempre', weather: [], terrain: 'mata', unlock: 'lendaria:arvore-ancestral' },
      ],
    },
    assets: [
      { id: 'arvore-morta-1', name: 'Árvore Morta 1', url: '/assets/natureza/DeadTree_1.glb', role: 'tree', zone: 'outside', height: [4, 6], count: 14, wind: 0.2 },
      { id: 'arvore-morta-2', name: 'Árvore Morta 2', url: '/assets/natureza/DeadTree_2.glb', role: 'tree', zone: 'outside', height: [3.5, 5.5], count: 12, wind: 0.2 },
      { id: 'arvore-morta-3', name: 'Árvore Morta 3', url: '/assets/natureza/DeadTree_3.glb', role: 'tree', zone: 'outside', height: [3, 5], count: 10, wind: 0.2 },
      { id: 'arvore-morta-4', name: 'Árvore Morta 4', url: '/assets/natureza/DeadTree_4.glb', role: 'tree', zone: 'outside', height: [2.8, 4.5], count: 8, wind: 0.2 },
      { id: 'arvore-morta-5', name: 'Árvore Morta 5', url: '/assets/natureza/DeadTree_5.glb', role: 'tree', zone: 'outside', height: [2.5, 4], count: 6, wind: 0.2 },
      { id: 'arvore-torta-1', name: 'Árvore Torta 1', url: '/assets/natureza/TwistedTree_1.glb', role: 'tree', zone: 'outside', height: [4, 6], count: 6, wind: 0.25 },
      { id: 'arvore-torta-2', name: 'Árvore Torta 2', url: '/assets/natureza/TwistedTree_2.glb', role: 'tree', zone: 'outside', height: [3.5, 5.5], count: 5, wind: 0.25 },
      { id: 'pedra-media-1', name: 'Pedra Média 1', url: '/assets/natureza/Rock_Medium_1.glb', role: 'rock', zone: 'edge', height: [1, 2], count: 15, wind: 0 },
      { id: 'pedra-media-2', name: 'Pedra Média 2', url: '/assets/natureza/Rock_Medium_2.glb', role: 'rock', zone: 'edge', height: [0.9, 1.8], count: 12, wind: 0 },
      { id: 'pedra-media-3', name: 'Pedra Média 3', url: '/assets/natureza/Rock_Medium_3.glb', role: 'rock', zone: 'edge', height: [0.8, 1.6], count: 10, wind: 0 },
      { id: 'caminho-pedra-fina', name: 'Caminho Pedra Fina', url: '/assets/natureza/RockPath_Round_Thin.glb', role: 'prop', zone: 'inside', height: [0.05, 0.1], count: 20, wind: 0 },
      { id: 'caminho-pedra-larga', name: 'Caminho Pedra Larga', url: '/assets/natureza/RockPath_Round_Wide.glb', role: 'prop', zone: 'inside', height: [0.05, 0.1], count: 15, wind: 0 },
      { id: 'seixo-quadrado-2', name: 'Seixo Quadrado 2', url: '/assets/natureza/Pebble_Square_2.glb', role: 'prop', zone: 'inside', height: [0.1, 0.2], count: 25, wind: 0 },
      { id: 'seixo-quadrado-3', name: 'Seixo Quadrado 3', url: '/assets/natureza/Pebble_Square_3.glb', role: 'prop', zone: 'inside', height: [0.1, 0.2], count: 20, wind: 0 },
      { id: 'seixo-quadrado-4', name: 'Seixo Quadrado 4', url: '/assets/natureza/Pebble_Square_4.glb', role: 'prop', zone: 'inside', height: [0.1, 0.2], count: 18, wind: 0 },
      { id: 'grama-curta-seca', name: 'Grama Curta Seca', url: '/assets/natureza/Grass_Common_Short.glb', role: 'grass', zone: 'inside', height: [0.05, 0.1], count: 80, wind: 0.5 },
    ],
  },
];

async function main() {
  console.log(`Inserindo ${BIOMES.length} biomas...`);

  let inserted = 0, skipped = 0;

  for (const biome of BIOMES) {
    const { slug, name, description, kind, palette, settings, assets } = biome;

    const { data: existing } = await supabase
      .from('biomes')
      .select('slug')
      .eq('slug', slug)
      .single();

    if (existing) {
      console.log(`  -> ${slug} ja existe`);
      skipped++;
      continue;
    }

    const biomeData = {
      slug,
      name,
      description,
      palette,
      settings,
      assets,
      status: 'published',
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from('biomes').insert(biomeData);

    if (error) {
      console.error(`  X ${slug}: ${error.message}`);
    } else {
      console.log(`  + ${slug} (${name}) - ${assets.length} assets`);
      inserted++;
    }
  }

  console.log(`\nFeito: ${inserted} inseridos, ${skipped} ja existiam.`);
}

main().catch(console.error);