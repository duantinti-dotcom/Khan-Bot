import { post, put } from './api.js';

// Executa uma operação; se ela invadir dinheiro separado para metas, pergunta antes
// de registrar o resgate automático (nunca resgata sem confirmação).
export async function withAllocCheck(fn) {
  try {
    return await fn(false);
  } catch (e) {
    if (e.data?.code === 'ALLOCATION_EXCEEDS') {
      const ok = window.confirm(`${e.message}\n\nQuer usar parte do dinheiro separado para metas? O app vai registrar um resgate dessas metas.`);
      if (ok) return fn(true);
      const err = new Error('Operação cancelada: o dinheiro das metas foi mantido.');
      err.cancelled = true;
      throw err;
    }
    throw e;
  }
}

// Marca uma conta (real ou ocorrência de recorrência) como paga / receita como recebida.
export function settle(item, today, extra = {}) {
  return withAllocCheck((withdraw) => {
    if (item.virtual) {
      return post(`/recurrences/${item.recurrence_id}/occurrence`, {
        occurrence_date: item.occurrence_date, action: 'realizar', withdraw_from_goals: withdraw,
        date: item.date > today ? today : item.date, ...extra,
      });
    }
    return put(`/transactions/${item.id}`, { status: 'realizado', date: item.date > today ? today : item.date, withdraw_from_goals: withdraw, ...extra });
  });
}

export function skipOccurrence(item) {
  return post(`/recurrences/${item.recurrence_id}/occurrence`, { occurrence_date: item.occurrence_date, action: 'pular' });
}
