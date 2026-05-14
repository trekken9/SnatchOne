// ═══════════════════════════════════════════════════════════
// ЛОГИКА ДЛЯ РОЛИ "ТОП" - Управление несколькими командами
// ═══════════════════════════════════════════════════════════

let currentTopTeamFilter = null; // null = все команды, иначе ID команды
let topTeamsData = []; // Список команд топа

// Фильтрация ключей по команде
window.filterByTeam = function(teamId) {
    currentTopTeamFilter = teamId;
    
    // Обновляем активную кнопку
    document.querySelectorAll('.team-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (teamId === null) {
        document.getElementById('team-filter-all').classList.add('active');
    } else {
        document.querySelector(`[data-team-id="${teamId}"]`)?.classList.add('active');
    }
    
    // Перерисовываем таблицу с фильтром
    renderFilteredKeys();
};

// Отрисовка таблицы ключей с учетом фильтра
function renderFilteredKeys() {
    const tbody = document.getElementById("licenses-table");
    if (!tbody) return;
    
    tbody.innerHTML = "";
    
    let filteredOperators = window.currentOperatorsData;
    
    // Применяем фильтр по команде
    if (currentTopTeamFilter !== null) {
        filteredOperators = filteredOperators.filter(op => op.creatorId === currentTopTeamFilter);
    }
    
    if (filteredOperators.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-3); padding:32px;">
            ${currentTopTeamFilter ? 'У этой команды нет ключей' : 'У вас нет активных ключей'}
        </td></tr>`;
        return;
    }
    
    // Получаем роль из данных
    const userRole = window.currentUserRole || 'team';
    
    filteredOperators.forEach((op) => {
        const days = Math.floor(op.expSec / 86400);
        const hours = Math.floor((op.expSec % 86400) / 3600);
        const timeClass = days < 1 ? "time-crit" : days < 3 ? "time-warn" : "time-ok";

        const infoBtn = op.isOnline
            ? `<button class="btn btn-icon" onclick="showOpDetails('${op.keyHash}')">📊 Инфо</button>`
            : "";

        // Топ не может удалять ключи, только смотреть
        const killBtn = userRole !== "translator" && userRole !== "top"
            ? `<button class="btn btn-danger" onclick="kickUser('${op.keyHash}')">Удалить</button>`
            : "";

        const renewBtnTop = userRole === "superadmin"
            ? `<button class="btn btn-success" onclick="renewLicense('${op.keyHash}')">Продлить</button>`
            : "";

        const tr = document.createElement("tr");
        tr.className = `key-row ${op.isOnline ? 'status-online' : 'status-offline'}`;
        tr.innerHTML = `
            <td><span class="dot ${op.isOnline ? "online" : "offline"}"></span></td>
            <td><strong>${op.operatorId || "Без имени"}</strong></td>
            <td><span class="${timeClass}">${days}д ${hours}ч</span></td>
            <td>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    ${infoBtn}
                    ${renewBtnTop}
                    ${killBtn}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Отрисовка кнопок команд для топа
function renderTopTeamButtons(teams) {
    const container = document.getElementById('team-filter-buttons');
    if (!container) return;
    
    container.innerHTML = '';
    topTeamsData = teams || [];
    
    teams.forEach(team => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary team-filter-btn';
        btn.setAttribute('data-team-id', team.id);
        btn.style.padding = '10px 20px';
        btn.onclick = () => filterByTeam(team.id);
        
        // Если есть аватар команды
        if (team.avatar) {
            const img = document.createElement('img');
            img.src = team.avatar;
            img.style.width = '20px';
            img.style.height = '20px';
            img.style.borderRadius = '50%';
            img.style.marginRight = '8px';
            img.style.verticalAlign = 'middle';
            btn.appendChild(img);
        }
        
        btn.appendChild(document.createTextNode(team.nickname || team.username || `Команда #${team.id}`));
        container.appendChild(btn);
    });
}

// Показать/скрыть фильтр команд для роли "Топ"
function toggleTopTeamFilter(show, teams) {
    const filterPanel = document.getElementById('top-team-filter');
    if (!filterPanel) return;
    
    if (show && teams && teams.length > 0) {
        filterPanel.style.display = 'block';
        renderTopTeamButtons(teams);
        
        // По умолчанию показываем все команды
        document.getElementById('team-filter-all').classList.add('active');
    } else {
        filterPanel.style.display = 'none';
    }
}

// Управление командами топа (для SuperAdmin)
window.manageTopTeams = async function(topUserId, topUsername) {
    try {
        const res = await fetch(`/admin/api/top_teams/${topUserId}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        
        if (!res.ok) {
            showToast('Ошибка загрузки команд', true);
            return;
        }
        
        const data = await res.json();
        
        // Создаем модальное окно для выбора команд
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(5px);
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: var(--surface);
            padding: 30px;
            border-radius: 16px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            border: 1px solid var(--border-light);
        `;
        
        let html = `
            <h3 style="margin-top:0; color:var(--text); margin-bottom: 20px;">
                Управление командами для: ${topUsername}
            </h3>
            <p style="color:var(--text-dim); margin-bottom: 20px; font-size: 14px;">
                Выберите команды, которые будет видеть этот топ:
            </p>
        `;
        
        if (data.allTeams.length === 0) {
            html += `<p style="color:var(--text-3); text-align:center; padding:20px;">Нет доступных команд</p>`;
        } else {
            html += `<div id="teams-list" style="display: flex; flex-direction: column; gap: 10px;">`;
            
            data.allTeams.forEach(team => {
                const isChecked = data.linkedTeams.includes(team.id);
                html += `
                    <label class="team-checkbox-label" data-team-id="${team.id}" style="display: flex; align-items: center; padding: 12px; background: var(--bg-secondary); border-radius: 10px; cursor: pointer; border: 2px solid ${isChecked ? 'var(--primary)' : 'var(--border)'}; transition: all 0.2s;">
                        <input type="checkbox" 
                               class="team-checkbox"
                               value="${team.id}" 
                               ${isChecked ? 'checked' : ''}
                               style="margin-right: 12px; width: 18px; height: 18px; cursor: pointer;">
                        <span style="color: var(--text); font-weight: 600;">
                            ${team.nickname || team.username || `Команда #${team.id}`}
                        </span>
                    </label>
                `;
            });
            
            html += `</div>`;
        }
        
        html += `
            <div style="display: flex; justify-content: space-between; gap: 15px; margin-top: 25px;">
                <button id="cancel-top-teams" class="btn btn-secondary" style="flex:1;">Отмена</button>
                <button id="save-top-teams" class="btn btn-primary" style="flex:1;">Сохранить</button>
            </div>
        `;
        
        content.innerHTML = html;
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Обработчик изменения чекбоксов - обновляем визуально
        const checkboxes = content.querySelectorAll('.team-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const label = this.closest('.team-checkbox-label');
                if (this.checked) {
                    label.style.borderColor = 'var(--primary)';
                    label.style.background = 'rgba(var(--sa-rgb), 0.1)';
                } else {
                    label.style.borderColor = 'var(--border)';
                    label.style.background = 'var(--bg-secondary)';
                }
            });
        });
        
        // Обработчики кнопок
        document.getElementById('cancel-top-teams').onclick = () => {
            modal.remove();
        };
        
        document.getElementById('save-top-teams').onclick = async () => {
            const selectedCheckboxes = content.querySelectorAll('.team-checkbox:checked');
            const selectedTeams = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value));
            
            try {
                const saveRes = await fetch('/admin/api/assign_teams', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${getToken()}`
                    },
                    body: JSON.stringify({
                        topUserId: topUserId,
                        teamIds: selectedTeams
                    })
                });
                
                const saveData = await saveRes.json();
                
                if (saveData.success) {
                    showToast(`✅ Команды для ${topUsername} обновлены!`);
                    modal.remove();
                    fetchUsersList();
                } else {
                    showToast('Ошибка сохранения', true);
                }
            } catch (e) {
                showToast('Ошибка сети!', true);
            }
        };
        
        // Закрытие по клику вне модалки
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
    } catch (e) {
        showToast('Ошибка загрузки данных', true);
    }
};

// Экспортируем функции для использования в основном коде
window.toggleTopTeamFilter = toggleTopTeamFilter;
window.renderFilteredKeys = renderFilteredKeys;
