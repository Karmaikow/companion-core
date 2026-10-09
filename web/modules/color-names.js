/** Deterministic Portuguese color descriptions; custom shades are approximations. */
export const SOUL_PALETTE = [
    { hex: '#3f8cff', name: 'Azul-safira' }, { hex: '#64834b', name: 'Verde-musgo' },
    { hex: '#bf6cff', name: 'Ametista' }, { hex: '#ff694d', name: 'Rubi flamejante' },
    { hex: '#edbd54', name: 'Ouro solar' }, { hex: '#42d9bd', name: 'Jade astral' }, { hex: '#ee83b4', name: 'Rosa aurora' }
];
export function describeColor(input) {
    if (!/^#[\da-f]{6}$/i.test(input))
        throw new Error('Cor hexadecimal inválida.');
    const hex = input.toLowerCase();
    const preset = SOUL_PALETTE.find(c => c.hex === hex);
    if (preset)
        return { hex, name: preset.name, approximate: false };
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min, l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    let h = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
    let name;
    if (l < .04)
        name = 'Preto';
    else if (l > .97)
        name = 'Branco';
    else if (s < .12)
        name = l < .3 ? 'Cinza escuro' : l > .75 ? 'Cinza claro' : 'Cinza';
    else {
        const base = h < 15 || h >= 345 ? 'Vermelho' : h < 45 ? 'Laranja' : h < 70 ? 'Amarelo' : h < 165 ? 'Verde' : h < 195 ? 'Turquesa' : h < 255 ? 'Azul' : h < 290 ? 'Violeta' : 'Rosa';
        if (base === 'Laranja' && l < .35)
            name = 'Marrom';
        else
            name = `${base}${l < .3 ? ' escuro' : l > .78 ? ' claro' : s < .4 ? ' suave' : s > .75 ? ' vivo' : ''}`;
    }
    return { hex, name, approximate: true };
}
/** Presentation only: keep stored, signed facts unchanged. */
export function readableColor(value) {
    return /^#[\da-f]{6}$/i.test(value) ? describeColor(value).name.toLocaleLowerCase('pt-BR') : value;
}
