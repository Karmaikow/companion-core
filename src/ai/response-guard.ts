import { readableColor } from '../core/color-names.js';
import type { CompanionState } from '../models/types.js';

export interface GuardResult {
  valid: boolean;
  response: string;
  reason?: string;
}

export class ResponseGuard {

  static validate(
    response: string,
    companion: CompanionState
  ): GuardResult {

    const normalized =
      response
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const name =
      companion.profile.name.toLowerCase();

    /*
     * O modelo não pode negar o próprio nome.
     */
    const deniesName =
      normalized.includes('nao tenho nome') ||
      normalized.includes('não tenho nome') ||
      normalized.includes('nao possuo nome') ||
      normalized.includes('não possuo nome') ||
      normalized.includes('nao tenho um nome') ||
      normalized.includes('não tenho um nome');

    if (deniesName) {

      return {
        valid: false,
        response:
          `Meu nome é ${companion.profile.name}. ` +
          `É assim que ${companion.profile.companionOf.preferredAddress} me conhece.`,
        reason:
          'A resposta contradiz a identidade da Companion.'
      };
    }

    /*
     * O modelo não deve negar que conhece o Companion.
     */
    const companionName =
      companion.profile.companionOf.name
        .toLowerCase();

    const deniesKnownName = /(?:^|[.!?]\s+)(?:eu\s+)?(?:ainda\s+)?nao (?:sei|conheco|lembro)(?:\s+(?:ainda|qual e))*\s+(?:o\s+)?(?:seu|teu) nome(?!\s+completo)\b/.test(normalized);
    if (deniesKnownName && companion.profile.companionOf.name) {
      return {
        valid: false,
        response: `Eu conheço você como ${companion.profile.companionOf.name}, meu companheiro. Te chamo de ${companion.profile.companionOf.preferredAddress}. 💙`,
        reason: 'A resposta nega o nome conhecido no perfil.'
      };
    }

    const deniesCompanion =
      normalized.includes(
        'nao conheco ' + companionName
      ) ||
      normalized.includes(
        'não conheço ' + companionName
      ) ||
      normalized.includes(
        'nunca conheci ' + companionName
      ) ||
      normalized.includes(
        'nao sei quem e ' + companionName
      ) ||
      normalized.includes(
        'não sei quem é ' + companionName
      );

    if (
      deniesCompanion &&
      companion.profile.companionOf.name
    ) {

      return {
        valid: false,
        response:
          `Eu conheço você, ${companion.profile.companionOf.preferredAddress}. ` +
          `Você é meu companheiro registrado no perfil.`,
        reason:
          'A resposta contradiz a relação conhecida.'
      };
    }

    /*
     * Cor favorita da Companion.
     */
    const favoriteColor =
      companion.profile.preferences.favoriteColor ? readableColor(companion.profile.preferences.favoriteColor) : undefined;

    if (favoriteColor) {

      const normalizedColor =
        favoriteColor
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');

      const asksOwnColor =
        normalized.includes('minha cor favorita') ||
        normalized.includes('minha cor preferida') ||
        normalized.includes('minha cor e') ||
        normalized.includes('minha cor é');

      if (
        asksOwnColor &&
        !normalized.includes(normalizedColor)
      ) {

        return {
          valid: false,
          response:
            `Minha cor favorita é ${favoriteColor}.`,
          reason:
            'A resposta não corresponde à preferência registrada.'
        };
      }
    }

    return {
      valid: true,
      response
    };
  }
}