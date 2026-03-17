const mysql = require('mysql2/promise');
const { Pool } = require('pg');

const connections = new Map();
let connectionCounter = 0;

async function connect(type, config) {
  const connectionId = `conn_${++connectionCounter}`;
  
  let client;
  if (type === 'mysql') {
    client = await mysql.createConnection({
      host: config.host,
      port: config.port || 3306,
      user: config.user,
      password: config.password,
      database: config.database
    });
  } else if (type === 'postgresql') {
    client = new Pool({
      host: config.host,
      port: config.port || 5432,
      user: config.user,
      password: config.password,
      database: config.database
    });
    await client.connect();
  }
  
  connections.set(connectionId, { type, client, config });
  return { success: true, connectionId };
}

async function disconnect(connectionId) {
  const conn = connections.get(connectionId);
  if (!conn) throw new Error('Connection not found');
  
  if (conn.type === 'mysql') {
    await conn.client.end();
  } else if (conn.type === 'postgresql') {
    await conn.client.end();
  }
  connections.delete(connectionId);
}

async function getDatabases(connectionId) {
  const conn = connections.get(connectionId);
  if (!conn) throw new Error('Connection not found');
  
  if (conn.type === 'mysql') {
    const [rows] = await conn.client.query('SHOW DATABASES');
    return rows.map(r => r.Database);
  } else {
    const result = await conn.client.query("SELECT datname FROM pg_database WHERE datistemplate = false");
    return result.rows.map(r => r.datname);
  }
}

async function getTables(connectionId, database) {
  const conn = connections.get(connectionId);
  if (!conn) throw new Error('Connection not found');
  
  if (conn.type === 'mysql') {
    const [rows] = await conn.client.query('SHOW TABLES');
    const key = `Tables_in_${database}`;
    return rows.map(r => r[key]);
  } else {
    const result = await conn.client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1",
      [database]
    );
    return result.rows.map(r => r.table_name);
  }
}

async function getIndexes(connectionId, database, table) {
  const conn = connections.get(connectionId);
  if (!conn) throw new Error('Connection not found');
  
  if (conn.type === 'mysql') {
    const [rows] = await conn.client.query('SHOW INDEX FROM ??', [table]);
    return rows;
  } else {
    const result = await conn.client.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 AND schemaname = $2`,
      [table, database]
    );
    return result.rows;
  }
}

async function analyzeSQL(connectionId, database, sql) {
  const conn = connections.get(connectionId);
  if (!conn) throw new Error('Connection not found');
  
  const sqlTrim = sql.trim().toLowerCase();
  const isSelect = sqlTrim.startsWith('select');
  
  let explainResult = null;
  let tableInfo = null;
  let indexInfo = null;
  let optimizationSuggestions = [];
  
  if (isSelect) {
    try {
      if (conn.type === 'mysql') {
        const [rows] = await conn.client.query(`EXPLAIN ${sql}`);
        explainResult = rows;
        
        const tables = extractTablesFromSQL(sql);
        if (tables.length > 0) {
          const mainTable = tables[0];
          const [indexRows] = await conn.client.query('SHOW INDEX FROM ??', [mainTable]);
          indexInfo = indexRows;
          
          const [tableRows] = await conn.client.query('DESCRIBE ??', [mainTable]);
          tableInfo = tableRows;
        }
      } else {
        const result = await conn.client.query(`EXPLAIN (FORMAT JSON) ${sql}`);
        explainResult = [result.rows[0]];
        
        const tables = extractTablesFromSQL(sql);
        if (tables.length > 0) {
          const mainTable = tables[0];
          const idxResult = await conn.client.query(
            `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 AND schemaname = $2`,
            [mainTable, database]
          );
          indexInfo = idxResult.rows;
          
          const tblResult = await conn.client.query(
            `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 AND table_schema = $2`,
            [mainTable, database]
          );
          tableInfo = tblResult.rows;
        }
      }
      
      optimizationSuggestions = generateSuggestions(explainResult, indexInfo, tableInfo, sql, conn.type);
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        suggestions: [{ type: 'error', message: `分析失败: ${error.message}` }]
      };
    }
  } else {
    optimizationSuggestions = [{ 
      type: 'info', 
      message: '仅支持 SELECT 查询的执行计划分析。其他语句无法通过 EXPLAIN 分析。' 
    }];
  }
  
  return {
    success: true,
    isSelect,
    explainResult,
    tableInfo,
    indexInfo,
    suggestions: optimizationSuggestions
  };
}

function extractTablesFromSQL(sql) {
  const tablePattern = /(?:from|join)\s+`?(\w+)`?/gi;
  const tables = [];
  let match;
  while ((match = tablePattern.exec(sql)) !== null) {
    const table = match[1].toLowerCase();
    if (!tables.includes(table) && table !== 'dual') {
      tables.push(table);
    }
  }
  return tables;
}

function generateSuggestions(explainResult, indexInfo, tableInfo, sql, dbType) {
  const suggestions = [];
  const sqlLower = sql.toLowerCase();
  
  if (!explainResult || explainResult.length === 0) {
    return suggestions;
  }
  
  const firstRow = explainResult[0];
  
  if (dbType === 'mysql') {
    if (firstRow.type === 'ALL') {
      suggestions.push({
        type: 'warning',
        priority: 'high',
        title: '全表扫描',
        message: '执行计划显示进行了全表扫描，这在大数据量时性能会很差。',
        suggestion: '考虑在 WHERE 条件的列上添加索引'
      });
    }
    
    if (firstRow.rows && firstRow.rows > 1000) {
      suggestions.push({
        type: 'warning',
        priority: 'medium',
        title: '扫描行数过多',
        message: `预计扫描 ${firstRow.rows} 行数据`,
        suggestion: '优化 WHERE 条件或添加合适的索引'
      });
    }
    
    if (firstRow.key === null) {
      suggestions.push({
        type: 'warning',
        priority: 'high',
        title: '未使用索引',
        message: '查询未使用任何索引',
        suggestion: '检查 WHERE 条件是否匹配现有索引'
      });
    }
  } else {
    const plan = firstRow['QUERY PLAN'];
    if (plan && plan.includes('Seq Scan')) {
      suggestions.push({
        type: 'warning',
        priority: 'high',
        title: '顺序扫描',
        message: '执行计划显示进行了顺序扫描（全表扫描）',
        suggestion: '考虑在 WHERE 条件的列上添加索引'
      });
    }
  }
  
  if (sqlLower.includes('select *')) {
    suggestions.push({
      type: 'info',
      priority: 'low',
      title: '避免使用 SELECT *',
      message: '使用 SELECT * 会读取不必要的字段',
      suggestion: '只查询需要的列，如 SELECT column1, column2'
    });
  }
  
  if (sqlLower.includes('like \'%')) {
    suggestions.push({
      type: 'warning',
      priority: 'medium',
      title: '前缀通配符',
      message: 'LIKE \'%xxx\' 无法使用索引',
      suggestion: '如果可能，使用 LIKE \'xxx%\' 或考虑全文搜索'
    });
  }
  
  if (sqlLower.includes('or ') && !sqlLower.includes(' union ')) {
    suggestions.push({
      type: 'info',
      priority: 'low',
      title: 'OR 条件优化',
      message: '多个 OR 条件可能导致索引失效',
      suggestion: '考虑使用 UNION 替代 OR'
    });
  }
  
  if (sqlLower.includes('order by rand()')) {
    suggestions.push({
      type: 'error',
      priority: 'high',
      title: '随机排序性能问题',
      message: 'ORDER BY RAND() 会导致全表排序，性能极差',
      suggestion: '在应用层实现随机选择，或使用其他方式'
    });
  }
  
  const nestedPattern = /select.*from.*\(select/gi;
  if (nestedPattern.test(sql)) {
    suggestions.push({
      type: 'info',
      priority: 'low',
      title: '子查询优化',
      message: '检测到嵌套子查询',
      suggestion: '考虑使用 JOIN 替代子查询，通常性能更好'
    });
  }
  
  if (sqlLower.includes('having ')) {
    suggestions.push({
      type: 'info',
      priority: 'low',
      title: 'HAVING 子句',
      message: 'HAVING 在分组后过滤，建议先用 WHERE 过滤',
      suggestion: '尽量在 WHERE 中完成过滤，减少分组数据量'
    });
  }
  
  if (sqlLower.includes('distinct ')) {
    suggestions.push({
      type: 'info',
      priority: 'low',
      title: 'DISTINCT 使用',
      message: 'DISTINCT 可能影响性能',
      suggestion: '确保确实需要去重，考虑在应用层处理'
    });
  }
  
  if (sqlLower.includes('limit ') && !sqlLower.includes('offset ')) {
    const limitMatch = sqlLower.match(/limit (\d+)/);
    if (limitMatch && parseInt(limitMatch[1]) > 100) {
      suggestions.push({
        type: 'info',
        priority: 'low',
        title: '大 LIMIT 值',
        message: `LIMIT ${limitMatch[1]} 可能返回大量数据`,
        suggestion: '建议分页查询，使用 LIMIT + OFFSET 或游标分页'
      });
    }
  }
  
  if (indexInfo && indexInfo.length > 0) {
    const indexedColumns = new Set();
    indexInfo.forEach(idx => {
      const col = dbType === 'mysql' ? idx.Column_name : idx.indexdef?.match(/\((.*?)\)/)?.[1];
      if (col) indexedColumns.add(col.toLowerCase());
    });
    
    const whereColumns = [];
    const wherePattern = /where\s+(\w+)\s*[=<>]/gi;
    let match;
    while ((match = wherePattern.exec(sql)) !== null) {
      whereColumns.push(match[1].toLowerCase());
    }
    
    const unindexedWhere = whereColumns.filter(c => !indexedColumns.has(c));
    if (unindexedWhere.length > 0) {
      suggestions.push({
        type: 'suggestion',
        priority: 'high',
        title: '建议添加索引',
        message: `以下 WHERE 条件列没有索引: ${unindexedWhere.join(', ')}`,
        suggestion: `CREATE INDEX idx_${unindexedWhere[0]} ON table_name(${unindexedWhere[0]})`
      });
    }
  }
  
  if (suggestions.length === 0) {
    suggestions.push({
      type: 'success',
      priority: 'low',
      title: '查询优化良好',
      message: '未发现明显的性能问题',
      suggestion: '继续使用最佳实践'
    });
  }
  
  return suggestions.sort((a, b) => {
    const priorityOrder = { error: 0, warning: 1, suggestion: 2, info: 3, success: 4 };
    return priorityOrder[a.type] - priorityOrder[b.type];
  });
}

module.exports = {
  connect,
  disconnect,
  getDatabases,
  getTables,
  getIndexes,
  analyzeSQL
};
