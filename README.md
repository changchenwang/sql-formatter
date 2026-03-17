# SQL 格式化工具 + 优化分析

一款功能强大的 SQL 格式化与性能优化工具，支持连接真实数据库进行 SQL 分析。

## 功能特性

### SQL 格式化
- 支持 SQL 语法高亮
- 可自定义关键字大小写
- 可调整缩进风格
- 自动检测常见拼写错误并提供修正建议
- 支持语法验证

### SQL 优化分析 (需连接数据库)
- 连接 MySQL/PostgreSQL 数据库
- 获取执行计划 (EXPLAIN)
- 检查现有索引
- 智能优化建议：
  - 全表扫描警告
  - 缺失索引提示
  - SQL 写法优化建议
  - 性能问题诊断

## 快速开始

### 前置要求
- Node.js 18+
- MySQL 或 PostgreSQL 数据库（仅用于分析功能）

### 安装

```bash
# 进入后端目录
cd backend

# 安装依赖
npm install
```

### 启动

```bash
# 启动后端服务
npm start
```

后端服务将在 http://localhost:3001 运行

### 使用

1. 在浏览器中打开 `index.html`
2. 点击右上角 "连接数据库" 按钮
3. 填写数据库连接信息
4. 输入 SQL 语句
5. 点击 "格式化" 或 "分析SQL"

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl + Enter | 格式化 SQL |
| Ctrl + Shift + C | 复制结果 |
| Ctrl + Shift + A | 分析 SQL |

## 项目结构

```
sql-formatter/
├── index.html          # 前端页面
├── README.md           # 说明文档
└── backend/
    ├── package.json   # 后端依赖
    ├── server.js      # API 服务
    └── db.js          # 数据库连接模块
```

## 安全说明

- 密码不会保存在浏览器中
- 连接信息仅保存在当前会话
- 建议在本地环境使用

## 开源协议

MIT License
