/**
 * pgClient.mjs — Cliente 100% VPS/PostgreSQL.
 *
 * Substitui completamente o SDK @supabase/supabase-js dentro do servidor.
 * Expõe a mesma superfície mínima usada pelo código legado
 * (from/select/insert/update/delete/eq/in/gte/lte/lt/not/order/limit/single/rpc)
 * porém executando SQL direto no PostgreSQL local da VPS.
 *
 * Regra do projeto: NADA além da VPS. Nenhuma chamada externa aqui.
 */

/** Converte "clients" -> "client_id" para resolver embeds simples. */
function foreignKeyFor(tableName) {
  const singular = tableName.endsWith('s') ? tableName.slice(0, -1) : tableName;
  return `${singular}_id`;
}

/**
 * Faz o parse de uma string de select no formato PostgREST.
 * Retorna colunas simples e embeds (relacionamentos).
 */
function parseSelect(selectExpression) {
  const raw = (selectExpression || '*').trim();
  const columns = [];
  const embeds = [];

  let buffer = '';
  let depth = 0;

  const flush = () => {
    const token = buffer.trim();
    buffer = '';
    if (!token) return;
    const match = token.match(/^([a-zA-Z0-9_]+)\s*\((.*)\)$/s);
    if (match) {
      embeds.push({ table: match[1], columns: match[2].trim() || '*' });
ようだ    } else {
      columns.push(token);
    }
  };

  for (const char of raw) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      flush();
      continue;
    }
    buffer += char;
  }
  flush();

  return { columns, embeds };
}

class PgQuery {
  constructor(pool, table) {
    this.pool = pool;
    this.table = table;
    this.operation = 'select';
    this.selectExpression = '*';
    this.filters = [];
    this.orders = [];
    this.limitValue = null;
    this.single = false;
    this.payload = null;
  }

  select(expression = '*') {
    if (this.operation === 'select') this.selectExpression = expression || '*';
    else this.returning = expression || '*';
    return this;
  }

  insert(values) {
    this.operation = 'insert';
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values) {
    this.operation = 'update';
    this.payload = values;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(column, value) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column, value) {
    this.filters.push({ type: 'neq', column, value });
    return this;
  }

  in(column, values) {
    this.filters.push({ type: 'in', column, value: values || [] });
    return this;
  }

  gt(column, value) {
    this.filters.push({ type: 'gt', column, value });
    return this;
  }

  gte(column, value) {
    this.filters.push({ type: 'gte', column, value });
    return this;
  }

  lt(column, value) {
    this.filters.push({ type: 'lt', column, value });
    return this;
  }

  lte(column, value) {
    this.filters.push({ type: 'lte', column, value });
    return this;
  }

  is(column, value) {
    this.filters.push({ type: 'is', column, value });
    return this;
  }

  not(column, operator, value) {
    this.filters.push({ type: 'not', column, operator, value });
    return this;
  }

  order(column, options = {}) {
    this.orders.push({ column, ascending: options.ascending !== false });
    return this;
  }

  limit(count) {
    this.limitValue = count;
    return this;
  }

  maybeSingle() {
    this.single = true;
    return this;
  }

  single(...args) {
    // `single` é usado como método encadeável, não como propriedade booleana.
    this.single = true;
    return this;
  }

  buildWhere(params) {
    const clauses = [];
    for (const filter of this.filters) {
      switch (filter.type) {
        case 'eq':
          params.push(filter.value);
          clauses.push(`"${filter.column}" = $${params.length}`);
          break;
        case 'neq':
          params.push(filter.value);
          clauses.push(`"${filter.column}" <> $${params.length}`);
          break;
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte': {
          const symbol = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[filter.type];
          params.push(filter.value);
          clauses.push(`"${filter.column}" ${symbol} $${params.length}`);
          break;
        }
        case 'in': {
          const list = Array.isArray(filter.value) ? filter.value : [];
          if (list.length === 0) {
            clauses.push('FALSE');
            break;
          }
          params.push(list);
          clauses.push(`"${filter.column}"::text = ANY($${params.length}::text[])`);
          break;
        }
        case 'is':
          clauses.push(`"${filter.column}" IS ${filter.value === null ? 'NULL' : String(filter.value).toUpperCase()}`);
          break;
        case 'not':
          if (filter.operator === 'is') {
            clauses.push(`"${filter.column}" IS NOT ${filter.value === null ? 'NULL' : String(filter.value).toUpperCase()}`);
          } else {
            params.push(filter.value);
            clauses.push(`NOT ("${filter.column}" = $${params.length})`);
          }
          break;
        default:
          break;
      }
    }
    return clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  }

  async run() {
    const params = [];

    if (this.operation === 'insert') {
      const rows = this.payload || [];
      if (rows.length === 0) return { data: [], error: null };
      const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
      const valueGroups = rows.map((row) => {
        const placeholders = columns.map((column) => {
          params.push(row[column] === undefined ? null : normalizeValue(row[column]));
          return `$${params.length}`;
        });
        return `(${placeholders.join(', ')})`;
      });
      const sql = `INSERT INTO "${this.table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${valueGroups.join(', ')} RETURNING *`;
      const { rows: inserted } = await this.pool.query(sql, params);
      return { data: this.single ? inserted[0] || null : inserted, error: null };
    }

    if (this.operation === 'update') {
      const entries = Object.entries(this.payload || {});
      if (entries.length === 0) return { data: null, error: null };
      const setClauses = entries.map(([column, value]) => {
        params.push(normalizeValue(value));
        return `"${column}" = $${params.length}`;
      });
      const sql = `UPDATE "${this.table}" SET ${setClauses.join(', ')}${this.buildWhere(params)} RETURNING *`;
      const { rows } = await this.pool.query(sql, params);
      return { data: this.single ? rows[0] || null : rows, error: null };
    }

    if (this.operation === 'delete') {
      const sql = `DELETE FROM "${this.table}"${this.buildWhere(params)} RETURNING *`;
      const { rows } = await this.pool.query(sql, params);
      return { data: rows, error: null };
    }

    const { columns, embeds } = parseSelect(this.selectExpression);
    const projection = columns.length === 0 || columns.includes('*')
      ? '*'
      : columns.map((column) => `"${column.trim()}"`).join(', ');

    let sql = `SELECT ${projection} FROM "${this.table}"${this.buildWhere(params)}`;
    if (this.orders.length > 0) {
      sql += ` ORDER BY ${this.orders.map((o) => `"${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`).join(', ')}`;
    }
    if (this.limitValue != null) sql += ` LIMIT ${Number(this.limitValue)}`;

    const { rows } = await this.pool.query(sql, params);

    // Resolve embeds simples (relacionamento por FK) com consultas extras.
    for (const embed of embeds) {
      const fkColumn = foreignKeyFor(embed.table);
      const ids = Array.from(new Set(rows.map((row) => row[fkColumn]).filter(Boolean)));
      if (ids.length === 0) {
        rows.forEach((row) => { row[embed.table] = null; });
        continue;
      }
      const embedProjection = embed.columns === '*'
        ? '*'
        : `"id", ${embed.columns.split(',').map((c) => `"${c.trim()}"`).join(', ')}`;
      const { rows: related } = await this.pool.query(
        `SELECT ${embedProjection} FROM "${embed.table}" WHERE id::text = ANY($1::text[])`,
        [ids.map(String)],
      );
      const byId = new Map(related.map((item) => [String(item.id), item]));
      rows.forEach((row) => {
        row[embed.table] = byId.get(String(row[fkColumn])) || null;
      });
    }

    return { data: this.single ? rows[0] || null : rows, error: null };
  }

  then(resolve, reject) {
    return this.run().then(resolve, reject).catch((error) => {
      if (reject) return reject(error);
      throw error;
    });
  }

  catch(onRejected) {
    return this.run().catch(onRejected);
  }
}

function normalizeValue(value) {
  if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value;
}

/**
 * Cria o cliente de banco local com API compatível.
 * @param {import('pg').Pool} pool
 */
export function createPgClient(pool) {
  return {
    from(table) {
      const query = new PgQuery(pool, table);
      // `single()` precisa ser chamável e encadeável.
      return query;
    },
    async rpc(functionName, args = {}) {
      const keys = Object.keys(args);
      const params = keys.map((key) => normalizeValue(args[key]));
      const placeholders = keys.map((key, index) => `${key} => $${index + 1}`);
      try {
        const { rows } = await pool.query(
          `SELECT * FROM ${functionName}(${placeholders.join(', ')})`,
          params,
        );
        return { data: rows, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  };
}
