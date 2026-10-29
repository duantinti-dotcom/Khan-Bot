// Cliente da API. Os dados ficam no servidor; o navegador guarda apenas o cookie de sessão (HttpOnly).
export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || 'Erro de comunicação.');
    this.status = status;
    this.data = data || {};
  }
}

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-fin-csrf': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { error: 'Sem conexão com o servidor. Verifique sua internet.' });
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b ?? {});
export const put = (p, b) => api('PUT', p, b);
export const del = (p) => api('DELETE', p);
