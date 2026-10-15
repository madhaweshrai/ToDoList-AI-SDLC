(function (global) {
  const BASE = '/api/todos';

  async function request(method, url, body) {
    const options = { method, headers: {} };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(url, options);
    } catch (networkError) {
      throw new Error('Could not reach the server. Please try again.');
    }

    if (response.status === 204) return null;

    let payload = null;
    try {
      payload = await response.json();
    } catch (parseError) {
      payload = null;
    }

    if (!response.ok) {
      const message = payload && payload.error && payload.error.message;
      const error = new Error(message || `Request failed (${response.status})`);
      // Callers classify failures by HTTP status and validation fields (409 = already saved, AD-5).
      error.status = response.status;
      const details = payload && payload.error && payload.error.details;
      if (Array.isArray(details)) error.details = details;
      throw error;
    }
    return payload;
  }

  global.TodoApi = {
    list({ status = 'all', q = '', priority = '' } = {}) {
      const params = new URLSearchParams();
      if (status && status !== 'all') params.set('status', status);
      if (q) params.set('q', q);
      if (priority) params.set('priority', priority);
      const query = params.toString();
      return request('GET', query ? `${BASE}?${query}` : BASE);
    },
    create(todo) {
      return request('POST', BASE, todo);
    },
    update(id, changes) {
      return request('PUT', `${BASE}/${encodeURIComponent(id)}`, changes);
    },
    remove(id) {
      return request('DELETE', `${BASE}/${encodeURIComponent(id)}`);
    },
    clearCompleted() {
      return request('DELETE', `${BASE}?completed=true`);
    },
  };
})(window);
