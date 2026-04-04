const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;
const dataPath = path.join(__dirname, 'tasks.json');

const users = [
  { username: 'sanjaykumpati', password: 'Sanjay@123', role: 'admin' },
  { username: 'member1', password: '123', role: 'member' },
  { username: 'member2', password: '123', role: 'member' }
];

function readTasks() {
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (error) {
    return [];
  }
}

function writeTasks(tasks) {
  fs.writeFileSync(dataPath, JSON.stringify(tasks, null, 2), 'utf8');
}

function findTaskById(tasks, id) {
  return tasks.find(task => task.id === id);
}

function getThreshold(task) {
  return typeof task.threshold === 'number' ? task.threshold : 100;
}

function dependenciesSatisfied(task, tasks) {
  if (!task.dependencies || task.dependencies.length === 0) {
    return true;
  }

  const predecessors = task.dependencies
    .map(id => findTaskById(tasks, id))
    .filter(Boolean);

  if (predecessors.length !== task.dependencies.length) {
    return false;
  }

  const satisfiedCount = predecessors.filter(pred => pred.progress >= getThreshold(pred)).length;

  if (task.dependencyMode === 'partial') {
    return satisfiedCount > 0;
  }

  return satisfiedCount === predecessors.length;
}

function determineStatus(task, tasks) {
  if (task.manuallyBlocked) {
    return 'blocked';
  }

  if (!task.dependencies || task.dependencies.length === 0) {
    return task.progress > 0 ? 'in-progress' : 'ready';
  }

  if (!dependenciesSatisfied(task, tasks)) {
    return 'blocked';
  }

  return task.progress > 0 ? 'in-progress' : 'ready';
}

function detectCycle(tasks) {
  const visited = new Set();
  const inStack = new Set();

  function dfs(taskId) {
    if (inStack.has(taskId)) {
      return true;
    }
    if (visited.has(taskId)) {
      return false;
    }

    visited.add(taskId);
    inStack.add(taskId);

    const task = findTaskById(tasks, taskId);
    if (task && task.dependencies) {
      for (const depId of task.dependencies) {
        if (dfs(depId)) {
          return true;
        }
      }
    }

    inStack.delete(taskId);
    return false;
  }

  return tasks.some(task => dfs(task.id));
}

function recalculateStatuses(tasks) {
  tasks.forEach(task => {
    task.status = determineStatus(task, tasks);
  });
}

if (!fs.existsSync(dataPath)) {
  writeTasks([]);
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const user = users.find(u => u.username.toLowerCase() === normalizedUsername && u.password === password);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  res.json({ username: user.username, role: user.role });
});

app.get('/api/tasks', (req, res) => {
  const tasks = readTasks();
  recalculateStatuses(tasks);

  if (req.query.member) {
    return res.json(tasks.filter(task => task.member === req.query.member));
  }

  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const { title, priority, member, dependencies = [], dependencyMode = 'full', threshold = 100 } = req.body;
  if (!title || !priority || !member) {
    return res.status(400).json({ message: 'Task title, priority and member are required' });
  }

  const tasks = readTasks();
  const dependencyIds = Array.isArray(dependencies)
    ? dependencies.map(id => Number(id)).filter(id => tasks.some(task => task.id === id))
    : [];

  const newTask = {
    id: Date.now(),
    title,
    priority,
    member,
    progress: 0,
    status: 'blocked',
    dependencies: dependencyIds,
    dependencyMode: dependencyMode === 'partial' ? 'partial' : 'full',
    threshold: Number(threshold) || 100,
    manuallyBlocked: false,
    blockedReason: null
  };

  const updatedTasks = [...tasks, newTask];
  if (detectCycle(updatedTasks)) {
    return res.status(400).json({ message: 'Dependency chain would create a circular relationship' });
  }

  recalculateStatuses(updatedTasks);
  writeTasks(updatedTasks);
  res.status(201).json(newTask);
});

app.put('/api/tasks/:id/progress', (req, res) => {
  const tasks = readTasks();
  const taskId = Number(req.params.id);
  const { progress, blocked, blockedReason, member } = req.body;
  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  if (typeof member !== 'undefined') {
    task.member = String(member);
  }

  if (typeof blocked !== 'undefined') {
    task.manuallyBlocked = Boolean(blocked);
    task.blockedReason = task.manuallyBlocked ? String(blockedReason || '') : null;
  }

  if (typeof progress !== 'undefined') {
    const parsed = Number(progress);
    if (!Number.isNaN(parsed)) {
      task.progress = parsed;
      if (task.progress > 0) {
        task.manuallyBlocked = false;
        task.blockedReason = null;
      }
    }
  }

  recalculateStatuses(tasks);
  writeTasks(tasks);

  const updatedTask = tasks.find(t => t.id === taskId);
  res.json(updatedTask);
});

app.listen(PORT, () => {
  console.log(`Nest Up backend running at http://localhost:${PORT}`);
});
