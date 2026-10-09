export interface CompanionProfile {

  /**
   * Nome da Companion.
   */
  name: string;

  appearance?: { soulColor: string; soulColorName?: string; formInfluences: string[] };
  creation?: { traits: string[]; labels: string[]; bigFive: { openness: number; conscientiousness: number; extraversion: number; agreeableness: number; emotionalStability: number }; ownerFavoriteColor?: string };


  /**
   * Pessoa que acompanha a Companion.
   */
  companionOf: {

    name: string;

    /**
     * Nome pelo qual a Companion deve chamar
     * essa pessoa.
     */
    preferredAddress: string;
  };


  /**
   * Identidade fundamental.
   */
  identity: {

    description: string;

    initialForm:
      | 'SOUL'
      | 'AWAKENED'
      | 'MANIFESTED'
      | 'ASCENDED';
  };


  /**
   * Preferências conhecidas.
   */
  preferences: {

    favoriteColor?: string;

    favoriteThings?: string[];
  };


  /**
   * Personalidade inicial.
   */
  personality: {

    loyalty: number;

    curiosity: number;

    humor: number;

    courage: number;

    empathy: number;

    autonomy: number;
  };


  /**
   * Informações sobre a gênese.
   */
  genesis: {

    version: string;

    message: string;

    initialForm:
      | 'SOUL'
      | 'AWAKENED'
      | 'MANIFESTED'
      | 'ASCENDED';
  };
}