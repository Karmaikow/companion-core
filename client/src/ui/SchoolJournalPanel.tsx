import { useEffect, useState } from 'react';
import { useGame } from '../store';
import { SCHOOL_DEFINITIONS, SCHOOL_RANKS } from '../../../shared/rules/combat/schools';
import type { SchoolJournal } from '../../../shared/rules/combat/schoolJournal';

export function SchoolJournalPanel() {
  const backend = useGame(s => s.backend);
  const companionId = useGame(s => s.snap?.companion?.id);
  const [journal, setJournal] = useState<SchoolJournal | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setJournal(null); setError(''); setLoading(false);
    if (!companionId || !backend) return;
    if (!backend.schools) { setError('O diário de escolas ainda não está disponível neste servidor.'); return; }
    setLoading(true);
    backend.schools().then(result => {
      if (!result.schools || result.schools.companionId !== companionId || result.schools.schemaVersion !== 1) throw new Error('O servidor ainda não disponibilizou o diário deste Companion.');
      if (!cancelled) setJournal(result.schools);
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Não foi possível carregar o diário.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [backend, companionId, refresh]);
  const visible = journal?.companionId === companionId ? journal : null;
  if (!companionId) return <p>Crie um Companion para acompanhar suas conquistas.</p>;
  return <section>
    <h3>Diário das escolas</h3>
    <p>Suas experiências já podem contar para as escolas futuras. As missões de ingresso ainda não estão disponíveis.</p>
    <button type="button" disabled={loading} onClick={() => setRefresh(n => n + 1)}>Atualizar conquistas</button>
    {loading && <p role="status">Consultando a história do Companion…</p>}
    {error && <p role="alert">{error}</p>}
    {visible && <>
      <p>{visible.simulated ? 'Modo local: conquistas deste aparelho, sem transferência para a economia online.' : 'Conquistas provenientes do histórico salvo no servidor.'}</p>
      {visible.schools.map(school => {
        const definition = SCHOOL_DEFINITIONS[school.id], requirement = SCHOOL_RANKS[0];
        return <article key={school.id}><h4>{definition.label} · Planejada</h4>
          <p>{school.progress.count} / {requirement.memories} memórias compatíveis · {school.progress.themes} / {requirement.themes} temas para iniciação.</p>
          <p>Marcantes: {school.progress.remarkable} · Extraordinárias: {school.progress.extraordinary}.</p>
          <details><summary>Requisitos e conquistas</summary>
            <p>Iniciação: nível {requirement.level}, primeiro marco de vínculo, missão da escola e 10 {definition.items[0]}. Materiais e missão ainda não disponíveis.</p>
            <ul>{visible.achievements.filter(m => m.themes.some(t => (definition.themes as readonly string[]).includes(t))).map(m => <li key={m.milestoneId}>{m.label} · {new Date(m.achievedAt).toLocaleDateString('pt-BR')} · evento #{m.eventId}</li>)}</ul>
          </details>
        </article>;
      })}
      {!visible.achievements.length && <p>Nenhuma conquista compatível registrada ainda. Conversas e memórias livres não concedem conquistas de escola.</p>}
      <p>A contagem considera conquistas distintas. Repetir a mesma fabricação ou análise não multiplica as memórias.</p>
    </>}
  </section>;
}
