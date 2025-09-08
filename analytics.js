// 分析機能メインスクリプト
import { SupabaseAPI } from './supabase-client.js';
import './toast.js'; // showToastはwindow.showToastとしてグローバルに利用可能

class AnalyticsPage {
    constructor() {
        this.clients = [];
        this.staffs = [];
        this.monthlyTasks = [];
        this.currentFilters = {
            startPeriod: '',
            endPeriod: '',
            staffId: '',
            fiscalMonth: ''
        };
        this.lastAnalysisData = null; // 最後の分析結果を保持
        this.currentSort = null; // 現在のソート列
        this.sortDirection = 'asc'; // ソート方向
    }

    async initialize() {
        console.log('Analytics page initializing...');
        
        try {
            // 認証状態確認
            const user = await SupabaseAPI.getCurrentUser();
            if (!user) {
                showToast('認証が必要です', 'error');
                window.location.href = 'index.html';
                return;
            }

            // 基本データ読み込み
            await this.loadInitialData();
            
            // UI初期化
            this.setupEventListeners();
            this.populateFilters();
            
            console.log('Analytics page initialized successfully');
            showToast('分析機能を読み込みました', 'success');
            
        } catch (error) {
            console.error('Analytics initialization failed:', error);
            showToast('分析機能の初期化に失敗しました', 'error');
        }
    }

    async loadInitialData() {
        console.log('Loading initial data...');
        
        // 並列でデータを取得
        const [clientsResult, staffsResult, tasksResult] = await Promise.all([
            SupabaseAPI.getClients(),
            SupabaseAPI.getStaffs(),
            SupabaseAPI.getMonthlyTasks()
        ]);

        this.clients = clientsResult || [];
        this.staffs = staffsResult || [];
        this.monthlyTasks = tasksResult || [];
        
        console.log(`Loaded: ${this.clients.length} clients, ${this.staffs.length} staffs, ${this.monthlyTasks.length} tasks`);
    }

    populateFilters() {
        // 期間選択のオプション生成（過去2年分）
        this.populatePeriodOptions();
        
        // 担当者選択のオプション生成
        this.populateStaffOptions();
        
        // デフォルト値設定
        this.setDefaultPeriod();
    }

    populatePeriodOptions() {
        const startSelect = document.getElementById('start-period');
        const endSelect = document.getElementById('end-period');
        
        // 現在の年月から過去2年分のオプションを生成
        const currentDate = new Date();
        const options = [];
        
        for (let i = 24; i >= 0; i--) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const value = `${year}-${month.toString().padStart(2, '0')}`;
            const text = `${year}年${month}月`;
            options.push({ value, text });
        }
        
        // オプション追加
        options.forEach(option => {
            const startOption = new Option(option.text, option.value);
            const endOption = new Option(option.text, option.value);
            startSelect.add(startOption);
            endSelect.add(endOption);
        });
    }

    populateStaffOptions() {
        const staffSelect = document.getElementById('staff-filter');
        
        this.staffs.forEach(staff => {
            const option = new Option(staff.name, staff.id);
            staffSelect.add(option);
        });
    }

    setDefaultPeriod() {
        const currentDate = new Date();
        const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 11, 1); // 12ヶ月前
        const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1); // 今月
        
        const startValue = `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}`;
        const endValue = `${endDate.getFullYear()}-${(endDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        document.getElementById('start-period').value = startValue;
        document.getElementById('end-period').value = endValue;
    }

    setupEventListeners() {
        // ナビゲーションボタン
        document.getElementById('back-to-main').addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        document.getElementById('performance-dashboard-button').addEventListener('click', () => {
            window.location.href = 'performance.html';
        });

        // 集計ボタン
        document.getElementById('aggregate-button').addEventListener('click', async () => {
            await this.performAnalysis();
        });

        // ソート機能
        document.querySelectorAll('[data-sort]').forEach(header => {
            header.addEventListener('click', (e) => {
                this.sortTable(e.target.dataset.sort);
            });
        });
    }

    async performAnalysis() {
        showToast('集計中...', 'info');
        
        try {
            // フィルター値取得
            this.currentFilters = {
                startPeriod: document.getElementById('start-period').value,
                endPeriod: document.getElementById('end-period').value,
                staffId: document.getElementById('staff-filter').value,
                fiscalMonth: document.getElementById('fiscal-month-filter').value
            };

            // バリデーション
            if (!this.currentFilters.startPeriod || !this.currentFilters.endPeriod) {
                showToast('期間を選択してください', 'error');
                return;
            }

            if (this.currentFilters.startPeriod > this.currentFilters.endPeriod) {
                showToast('開始年月は終了年月より前に設定してください', 'error');
                return;
            }

            // 分析実行
            const analysisData = await this.calculateAnalytics();
            
            // 分析結果を保存
            this.lastAnalysisData = analysisData;
            
            // 結果表示
            this.displaySummary(analysisData.summary);
            this.displayProgressMatrix(analysisData.matrix);
            
            // サマリーダッシュボード表示
            document.getElementById('summary-dashboard').style.display = 'block';
            
            showToast('集計が完了しました', 'success');
            
        } catch (error) {
            console.error('Analysis failed:', error);
            showToast('集計に失敗しました', 'error');
        }
    }

    async calculateAnalytics() {
        console.log('Calculating analytics with filters:', this.currentFilters);
        
        // フィルター適用済みクライアント取得
        const filteredClients = this.getFilteredClients();
        console.log(`Filtered clients: ${filteredClients.length}`);
        
        // 期間内の月次タスクデータ取得
        const periodTasks = this.getPeriodTasks(filteredClients);
        
        // サマリー計算
        const summary = this.calculateSummary(filteredClients, periodTasks);
        
        // マトリクス計算
        const matrix = this.calculateMatrix(filteredClients, periodTasks);
        
        return { summary, matrix };
    }

    getFilteredClients() {
        return this.clients.filter(client => {
            // 担当者フィルター
            if (this.currentFilters.staffId && client.staff_id != this.currentFilters.staffId) {
                return false;
            }
            
            // 決算月フィルター
            if (this.currentFilters.fiscalMonth && client.fiscal_month != this.currentFilters.fiscalMonth) {
                return false;
            }
            
            return true;
        });
    }

    getPeriodTasks(clients) {
        const clientIds = clients.map(c => c.id);
        const startDate = new Date(this.currentFilters.startPeriod + '-01');
        const endDate = new Date(this.currentFilters.endPeriod + '-01');
        
        return this.monthlyTasks.filter(task => {
            if (!clientIds.includes(task.client_id)) return false;
            
            const taskDate = new Date(task.month + '-01');
            return taskDate >= startDate && taskDate <= endDate;
        });
    }

    calculateSummary(clients, tasks) {
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(task => task.status === '完了').length;
        const progressRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        
        // 要注意クライアント（進捗率50%未満）
        const attentionClients = [];
        clients.forEach(client => {
            const clientTasks = tasks.filter(t => t.client_id === client.id);
            const clientCompleted = clientTasks.filter(t => t.status === '完了').length;
            const clientProgressRate = clientTasks.length > 0 ? (clientCompleted / clientTasks.length) * 100 : 0;
            
            if (clientProgressRate < 50 && clientTasks.length > 0) {
                attentionClients.push({
                    name: client.name,
                    progressRate: Math.round(clientProgressRate)
                });
            }
        });
        
        return {
            progressRate,
            completedTasks,
            totalTasks,
            attentionClients
        };
    }

    calculateMatrix(clients, tasks) {
        return clients.map(client => {
            const clientTasks = tasks.filter(t => t.client_id === client.id);
            const completedTasks = clientTasks.filter(t => t.status === '完了').length;
            const progressRate = clientTasks.length > 0 ? Math.round((completedTasks / clientTasks.length) * 100) : 0;
            
            // 担当者名取得
            const staff = this.staffs.find(s => s.id === client.staff_id);
            
            // 月別進捗データ
            const monthlyProgress = this.getMonthlyProgressForClient(client.id, tasks);
            
            return {
                clientId: client.id,
                clientName: client.name,
                staffName: staff ? staff.name : '未設定',
                fiscalMonth: client.fiscal_month,
                progressRate,
                completedTasks,
                totalTasks: clientTasks.length,
                monthlyProgress
            };
        });
    }

    getMonthlyProgressForClient(clientId, allTasks) {
        const clientTasks = allTasks.filter(t => t.client_id === clientId);
        const monthlyData = {};
        
        // 期間内の各月について集計
        const startDate = new Date(this.currentFilters.startPeriod + '-01');
        const endDate = new Date(this.currentFilters.endPeriod + '-01');
        
        for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
            const monthKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            const monthTasks = clientTasks.filter(t => t.month === monthKey);
            const completed = monthTasks.filter(t => t.status === '完了').length;
            
            monthlyData[monthKey] = {
                completed,
                total: monthTasks.length,
                rate: monthTasks.length > 0 ? Math.round((completed / monthTasks.length) * 100) : 0
            };
        }
        
        return monthlyData;
    }

    displaySummary(summary) {
        document.getElementById('overall-progress').textContent = `${summary.progressRate}%`;
        document.getElementById('completed-tasks').textContent = `${summary.completedTasks} / ${summary.totalTasks}`;
        document.getElementById('attention-clients').textContent = `${summary.attentionClients.length}件`;
        
        // 要注意クライアントリスト
        const attentionList = document.getElementById('attention-clients-list');
        const attentionContainer = document.getElementById('attention-list');
        
        if (summary.attentionClients.length > 0) {
            attentionList.innerHTML = summary.attentionClients
                .map(client => `<li>${client.name} (進捗率: ${client.progressRate}%)</li>`)
                .join('');
            attentionContainer.style.display = 'block';
        } else {
            attentionContainer.style.display = 'none';
        }
    }

    displayProgressMatrix(matrix) {
        // テーブルヘッダーを更新（月別列を追加）
        this.updateTableHeaders();
        
        const tbody = document.querySelector('#analytics-table tbody');
        tbody.innerHTML = '';
        
        matrix.forEach(row => {
            const tr = document.createElement('tr');
            
            // 基本列
            tr.innerHTML = `
                <td style="border: 1px solid #dee2e6; padding: 8px;">${row.clientName}</td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">
                    <span style="font-weight: bold; color: ${this.getProgressColor(row.progressRate)};">
                        ${row.progressRate}%
                    </span>
                </td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${row.staffName}</td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${row.fiscalMonth}月</td>
            `;
            
            // 月別進捗列を追加
            this.addMonthlyProgressCells(tr, row.monthlyProgress);
            
            tbody.appendChild(tr);
        });
    }

    updateTableHeaders() {
        const thead = document.querySelector('#analytics-table thead tr');
        
        // 既存の月別列を削除（基本列のみ残す）
        const monthColumns = thead.querySelectorAll('.month-column');
        monthColumns.forEach(col => col.remove());
        
        // 期間内の月別列を追加
        const startDate = new Date(this.currentFilters.startPeriod + '-01');
        const endDate = new Date(this.currentFilters.endPeriod + '-01');
        
        for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
            const monthKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            
            const th = document.createElement('th');
            th.className = 'month-column';
            th.style.cssText = 'border: 1px solid #dee2e6; padding: 12px; text-align: center; cursor: pointer;';
            th.setAttribute('data-sort', `month-${monthKey}`);
            th.innerHTML = `${year}/${month}<br><span class="sort-icon">▲▼</span>`;
            
            // ソートイベントリスナー追加
            th.addEventListener('click', () => {
                this.sortTableByMonth(monthKey);
            });
            
            thead.appendChild(th);
        }
    }

    addMonthlyProgressCells(tr, monthlyProgress) {
        const startDate = new Date(this.currentFilters.startPeriod + '-01');
        const endDate = new Date(this.currentFilters.endPeriod + '-01');
        
        for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
            const monthKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            const monthData = monthlyProgress[monthKey] || { completed: 0, total: 0, rate: 0 };
            
            const td = document.createElement('td');
            td.style.cssText = 'border: 1px solid #dee2e6; padding: 8px; text-align: center;';
            
            if (monthData.total > 0) {
                const progressColor = this.getProgressColor(monthData.rate);
                td.innerHTML = `
                    <div style="background: ${progressColor}; color: white; padding: 4px 6px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                        ${monthData.completed}/${monthData.total}
                    </div>
                `;
            } else {
                td.innerHTML = '<span style="color: #999;">-</span>';
            }
            
            tr.appendChild(td);
        }
    }

    sortTableByMonth(monthKey) {
        console.log(`Sorting by month: ${monthKey}`);
        
        if (!this.lastAnalysisData || !this.lastAnalysisData.matrix) {
            showToast('先に集計を実行してください', 'info');
            return;
        }

        const sortKey = `month-${monthKey}`;
        
        // ソート状態管理
        if (this.currentSort === sortKey) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort = sortKey;
            this.sortDirection = 'asc';
        }

        // ソート実行
        let sortedMatrix = [...this.lastAnalysisData.matrix];
        
        sortedMatrix.sort((a, b) => {
            const aData = a.monthlyProgress[monthKey] || { rate: -1 };
            const bData = b.monthlyProgress[monthKey] || { rate: -1 };
            
            const result = aData.rate - bData.rate;
            return this.sortDirection === 'asc' ? result : -result;
        });

        // ソートアイコン更新
        this.updateSortIcons(sortKey);
        
        // 表示更新
        this.displayProgressMatrix(sortedMatrix);
        
        const [year, month] = monthKey.split('-');
        showToast(`${year}年${month}月の進捗率で${this.sortDirection === 'asc' ? '昇順' : '降順'}ソート`, 'success');
    }

    getProgressColor(rate) {
        if (rate >= 80) return '#28a745'; // 緑
        if (rate >= 50) return '#ffc107'; // 黄
        return '#dc3545'; // 赤
    }

    sortTable(sortBy) {
        console.log(`Sorting by: ${sortBy}`);
        
        if (!this.lastAnalysisData || !this.lastAnalysisData.matrix) {
            showToast('先に集計を実行してください', 'info');
            return;
        }

        // 現在のソート状態を管理
        if (this.currentSort === sortBy) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort = sortBy;
            this.sortDirection = 'asc';
        }

        // ソート実行
        let sortedMatrix = [...this.lastAnalysisData.matrix];
        
        sortedMatrix.sort((a, b) => {
            let aValue, bValue;
            
            switch (sortBy) {
                case 'name':
                    aValue = a.clientName;
                    bValue = b.clientName;
                    break;
                case 'progress':
                    aValue = a.progressRate;
                    bValue = b.progressRate;
                    break;
                default:
                    return 0;
            }
            
            // 文字列の場合
            if (typeof aValue === 'string') {
                const result = aValue.localeCompare(bValue, 'ja');
                return this.sortDirection === 'asc' ? result : -result;
            }
            
            // 数値の場合
            const result = aValue - bValue;
            return this.sortDirection === 'asc' ? result : -result;
        });

        // ソートアイコン更新
        this.updateSortIcons(sortBy);
        
        // 表示更新
        this.displayProgressMatrix(sortedMatrix);
        
        showToast(`${sortBy === 'name' ? '事業者名' : '進捗率'}で${this.sortDirection === 'asc' ? '昇順' : '降順'}ソート`, 'success');
    }

    updateSortIcons(activeSortBy) {
        // 全てのソートアイコンをリセット
        document.querySelectorAll('.sort-icon').forEach(icon => {
            icon.textContent = '▲▼';
            icon.style.color = '#999';
        });

        // アクティブなソートアイコンを更新
        const activeHeader = document.querySelector(`[data-sort="${activeSortBy}"] .sort-icon`);
        if (activeHeader) {
            activeHeader.textContent = this.sortDirection === 'asc' ? '▲' : '▼';
            activeHeader.style.color = '#007bff';
        }
    }
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', async () => {
    const analytics = new AnalyticsPage();
    await analytics.initialize();
});