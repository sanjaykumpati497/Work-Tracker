const API_ROOT = window.location.protocol === 'file:' ? 'http://localhost:8000' : '';
const api = path => API_ROOT + path;

async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch(api('/api/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      throw new Error('Invalid login');
    }

    const user = await response.json();
    localStorage.setItem('currentUser', JSON.stringify(user));

    if (user.role === 'admin') {
      window.location = 'admin.html';
    } else {
      window.location = 'member.html';
    }
  } catch (error) {
    alert('Invalid Login');
  }
}

async function createTask() {
  const title = document.getElementById('title').value;
  const priority = document.getElementById('priority').value;
  const member = document.getElementById('member').value;
  const dependencyMode = document.getElementById('dependencyMode')?.value || 'full';
  const dependencySelect = document.getElementById('dependencies');
  const thresholdInput = document.getElementById('threshold');

  const dependencies = dependencySelect
    ? Array.from(dependencySelect.selectedOptions).map(option => Number(option.value))
    : [];
  const threshold = thresholdInput && thresholdInput.value ? Number(thresholdInput.value) : 100;

  const response = await fetch(api('/api/tasks'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, priority, member, dependencies, dependencyMode, threshold })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    alert(error?.message || 'Could not create task');
    return;
  }

  document.getElementById('title').value = '';
  if (dependencySelect) {
    dependencySelect.selectedIndex = -1;
  }
  if (thresholdInput) {
    thresholdInput.value = '';
  }
  loadTasks();
  populateDependencyOptions();
}

async function populateDependencyOptions() {
  const select = document.getElementById('dependencies');
  if (!select) {
    return;
  }

  const response = await fetch(api('/api/tasks'));
  if (!response.ok) {
    return;
  }

  const tasks = await response.json();
  select.innerHTML = tasks.map(t => `
    <option value="${t.id}">${t.title} (${t.status || 'unknown'})</option>
  `).join('');
}

async function loadTasks() {
  const taskList = document.getElementById('taskList');
  if (!taskList) {
    return;
  }

  const response = await fetch(api('/api/tasks'));
  if (!response.ok) {
    taskList.innerHTML = '<p>Unable to load tasks.</p>';
    return;
  }

  const tasks = await response.json();
  if (tasks.length === 0) {
    taskList.innerHTML = '<p>No tasks created yet.</p>';
    renderAdminDashboard(tasks);
    return;
  }
  const members = ['member1', 'member2'];
  taskList.innerHTML = tasks.map(t => `
    <div class="task">
      <div><strong>${t.title}</strong> <span class="assignee">(${t.member})</span></div>
      <div>Status: ${t.status || 'unknown'}</div>
      <div>Priority: ${t.priority}</div>
      ${t.dependencies && t.dependencies.length ? `<div>Depends on: ${t.dependencies.join(', ')}</div>` : ''}
      <div>Threshold: ${t.threshold || 100}</div>
      <div class="task-controls">
        <select id="assignMember-${t.id}">
          ${members.map(member => `<option value="${member}" ${member === t.member ? 'selected' : ''}>${member}</option>`).join('')}
        </select>
        <button onclick="assignTask(${t.id})">Assign</button>
      </div>
    </div>
  `).join('');
  renderAdminDashboard(tasks);
}

async function loadMemberTasks() {
  const memberTasks = document.getElementById('memberTasks');
  const blockingTasks = document.getElementById('blockingTasks');
  if (!memberTasks) {
    return;
  }

  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  if (!currentUser) {
    memberTasks.innerHTML = '<p>Please log in first.</p>';
    if (blockingTasks) {
      blockingTasks.innerHTML = '';
    }
    return;
  }

  const [allResponse, memberResponse] = await Promise.all([
    fetch(api('/api/tasks')),
    fetch(api(`/api/tasks?member=${encodeURIComponent(currentUser.username)}`))
  ]);

  if (!allResponse.ok || !memberResponse.ok) {
    memberTasks.innerHTML = '<p>Unable to load tasks.</p>';
    if (blockingTasks) {
      blockingTasks.innerHTML = '';
    }
    return;
  }

  const allTasks = await allResponse.json();
  const tasks = await memberResponse.json();

  if (tasks.length === 0) {
    memberTasks.innerHTML = '<p>No tasks assigned.</p>';
    if (blockingTasks) {
      blockingTasks.innerHTML = '<p>No tasks are blocking other work.</p>';
    }
    return;
  }

  const dependencyMap = allTasks.reduce((map, task) => {
    (task.dependencies || []).forEach(dep => {
      if (!map[dep]) {
        map[dep] = [];
      }
      map[dep].push(task);
    });
    return map;
  }, {});

  memberTasks.innerHTML = tasks.map(t => {
    const dependents = dependencyMap[t.id] || [];
    const isBlocked = t.status === 'blocked';
    const blockedBecause = t.manuallyBlocked ? '<div class="blocked-reason">Blocked reason: ' + (t.blockedReason || 'No reason provided') + '</div>' : '';
    const blockLabel = t.manuallyBlocked ? 'Unblock' : 'Mark blocked';
    return `
      <div class="task ${isBlocked ? 'blocked' : ''}">
        <div><strong>${t.title}</strong> <span class="status">${t.status || 'unknown'}</span></div>
        <div>Priority: ${t.priority}</div>
        ${t.dependencies && t.dependencies.length ? `<div>Depends on: ${t.dependencies.join(', ')}</div>` : ''}
        ${blockedBecause}
        <div class="task-controls">
          <input type="number" min="0" max="100" onchange="updateProgress(${t.id}, this.value)" placeholder="progress" ${isBlocked ? 'disabled' : ''}>
          <input type="text" id="blockReason-${t.id}" class="block-reason" placeholder="Block reason">
          <button onclick="setTaskBlocked(${t.id})">Mark blocked</button>
          ${t.manuallyBlocked ? `<button onclick="clearTaskBlocked(${t.id})">Unblock</button>` : ''}
        </div>
        ${dependents.length ? `<div class="blocking-list">Blocking: ${dependents.map(dep => dep.title).join(', ')}</div>` : ''}
      </div>
    `;
  }).join('');

  if (blockingTasks) {
    const blocking = tasks.filter(t => (dependencyMap[t.id] || []).length > 0);
    if (blocking.length === 0) {
      blockingTasks.innerHTML = '<p>No assigned tasks are blocking other work.</p>';
    } else {
      blockingTasks.innerHTML = blocking.map(t => `
        <div class="dashboard-item">
          <strong>${t.title}</strong> is blocking ${dependencyMap[t.id].length} item(s)
        </div>
      `).join('');
    }
  }
}

async function updateProgress(id, value) {
  const response = await fetch(api(`/api/tasks/${id}/progress`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ progress: value })
  });

  if (response.ok) {
    loadTasks();
    if (document.getElementById('memberTasks')) {
      loadMemberTasks();
    }
  }
}

async function assignTask(id) {
  const select = document.getElementById(`assignMember-${id}`);
  if (!select) {
    return;
  }
  const member = select.value;

  const response = await fetch(api(`/api/tasks/${id}/progress`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ member })
  });

  if (response.ok) {
    loadTasks();
  }
}

async function setTaskBlocked(id) {
  const reasonInput = document.getElementById(`blockReason-${id}`);
  const reason = reasonInput ? reasonInput.value : '';

  const response = await fetch(api(`/api/tasks/${id}/progress`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocked: true, blockedReason: reason })
  });

  if (response.ok) {
    loadTasks();
    if (document.getElementById('memberTasks')) {
      loadMemberTasks();
    }
  }
}

async function clearTaskBlocked(id) {
  const response = await fetch(api(`/api/tasks/${id}/progress`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocked: false, blockedReason: '' })
  });

  if (response.ok) {
    loadTasks();
    if (document.getElementById('memberTasks')) {
      loadMemberTasks();
    }
  }
}

function showCurrentUser() {
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  const pathname = document.location.pathname;
  const isAdminPage = pathname.endsWith('admin.html');
  const isMemberPage = pathname.endsWith('member.html');
  const isLoginPage = pathname === '/' || pathname.endsWith('login.html');

  if (!currentUser) {
    if (isAdminPage || isMemberPage) {
      window.location = '/';
    }
    return;
  }

  if (isLoginPage) {
    if (currentUser.role === 'admin') {
      window.location = 'admin.html';
    } else {
      window.location = 'member.html';
    }
    return;
  }

  const userInfo = document.getElementById('userInfo');
  if (userInfo) {
    userInfo.innerHTML = `<p>Logged in as <strong>${currentUser.username}</strong> (${currentUser.role})</p>`;
  }

  if (isAdminPage && currentUser.role !== 'admin') {
    window.location = '/';
  }
  if (isMemberPage && currentUser.role !== 'member') {
    window.location = '/';
  }
}

function logout() {
  localStorage.removeItem('currentUser');
  window.location = '/';
}

window.onload = function() {
  const pathname = document.location.pathname;
  const isAdminPage = pathname.endsWith('admin.html');
  const isMemberPage = pathname.endsWith('member.html');
  const isLoginPage = pathname === '/' || pathname.endsWith('login.html');

  if (isAdminPage || isMemberPage || isLoginPage) {
    showCurrentUser();
  }

  if (isAdminPage) {
    loadTasks();
    populateDependencyOptions();
  }

  if (isMemberPage) {
    loadMemberTasks();
  }
};
