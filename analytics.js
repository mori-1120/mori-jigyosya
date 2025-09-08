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
            
            // URLパラメータから担当者を自動選択
            this.handleUrlParameters();
            
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

        // エクスポート機能
        this.setupExportEventListeners();
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
            
            // エクスポートボタンを有効化
            document.getElementById('export-button').disabled = false;
            
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
        let totalTasks = 0;
        let completedTasks = 0;
        
        // 各月次レコードのtasksJSONを展開してタスク数を計算
        tasks.forEach(monthlyTask => {
            if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                const tasksList = Object.values(monthlyTask.tasks);
                totalTasks += tasksList.length;
                
                // 完了タスク数を計算
                const completedCount = tasksList.filter(task => task === true || task === '完了').length;
                completedTasks += completedCount;
            }
        });
        
        const progressRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        
        // 要注意クライアント（進捗率50%未満）
        const attentionClients = [];
        clients.forEach(client => {
            const clientMonthlyTasks = tasks.filter(t => t.client_id === client.id);
            let clientTotal = 0;
            let clientCompleted = 0;
            
            clientMonthlyTasks.forEach(monthlyTask => {
                if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                    const tasksList = Object.values(monthlyTask.tasks);
                    clientTotal += tasksList.length;
                    
                    const completedCount = tasksList.filter(task => task === true || task === '完了').length;
                    clientCompleted += completedCount;
                }
            });
            
            const clientProgressRate = clientTotal > 0 ? (clientCompleted / clientTotal) * 100 : 0;
            
            if (clientProgressRate < 50 && clientTotal > 0) {
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
            const clientMonthlyTasks = tasks.filter(t => t.client_id === client.id);
            let totalTasks = 0;
            let completedTasks = 0;
            
            // クライアントの全タスクを計算
            clientMonthlyTasks.forEach(monthlyTask => {
                if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                    const tasksList = Object.values(monthlyTask.tasks);
                    totalTasks += tasksList.length;
                    
                    const completedCount = tasksList.filter(task => task === true || task === '完了').length;
                    completedTasks += completedCount;
                }
            });
            
            const progressRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            
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
                totalTasks,
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
            
            let totalTasks = 0;
            let completedTasks = 0;
            
            // 各月のタスクレコード内のJSONタスクを計算
            monthTasks.forEach(monthlyTask => {
                if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                    const tasksList = Object.values(monthlyTask.tasks);
                    totalTasks += tasksList.length;
                    
                    const completedCount = tasksList.filter(task => task === true || task === '完了').length;
                    completedTasks += completedCount;
                }
            });
            
            monthlyData[monthKey] = {
                completed: completedTasks,
                total: totalTasks,
                rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
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
                <td style="border: 1px solid #dee2e6; padding: 8px;">
                    <a href="details.html?id=${row.clientId}" 
                       style="color: #007bff; text-decoration: none; cursor: pointer;"
                       onmouseover="this.style.textDecoration='underline'"
                       onmouseout="this.style.textDecoration='none'">
                        ${row.clientName}
                    </a>
                </td>
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
            th.style.cssText = 'border: 1px solid #dee2e6; padding: 12px; text-align: center; cursor: pointer; background: #f8f9fa; position: sticky; top: 0; z-index: 10;';
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

    handleUrlParameters() {
        // URLパラメータを取得
        const urlParams = new URLSearchParams(window.location.search);
        const staffId = urlParams.get('staff');
        
        if (staffId) {
            // 担当者フィルターを自動選択
            const staffSelect = document.getElementById('staff-filter');
            if (staffSelect) {
                staffSelect.value = staffId;
                
                // 選択された担当者名を表示
                const selectedStaff = this.staffs.find(s => s.id == staffId);
                if (selectedStaff) {
                    showToast(`担当者「${selectedStaff.name}」の分析画面を表示しています`, 'info');
                    
                    // 自動的に分析を実行
                    setTimeout(() => {
                        this.performAnalysis();
                    }, 1000);
                }
            }
        }
    }

    setupExportEventListeners() {
        // エクスポートボタンクリックでメニュー表示切り替え
        document.getElementById('export-button').addEventListener('click', () => {
            const menu = document.getElementById('export-menu');
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        });

        // メニュー外クリックで閉じる
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.export-dropdown')) {
                document.getElementById('export-menu').style.display = 'none';
            }
        });
    }

    exportToCSV() {
        if (!this.lastAnalysisData) {
            showToast('先に集計を実行してください', 'warning');
            return;
        }

        try {
            const csvData = this.generateCSVData();
            this.downloadCSV(csvData, `進捗分析結果_${this.getCurrentDateString()}.csv`);
            showToast('CSV形式でエクスポートしました', 'success');
            document.getElementById('export-menu').style.display = 'none';
        } catch (error) {
            console.error('CSV export failed:', error);
            showToast('CSVエクスポートに失敗しました', 'error');
        }
    }

    exportToExcel() {
        if (!this.lastAnalysisData) {
            showToast('先に集計を実行してください', 'warning');
            return;
        }

        try {
            const excelData = this.generateExcelData();
            this.downloadExcel(excelData, `進捗分析結果_${this.getCurrentDateString()}.xlsx`);
            showToast('Excel形式でエクスポートしました', 'success');
            document.getElementById('export-menu').style.display = 'none';
        } catch (error) {
            console.error('Excel export failed:', error);
            showToast('Excelエクスポートに失敗しました', 'error');
        }
    }

    generateCSVData() {
        const { summary, matrix } = this.lastAnalysisData;
        let csvContent = '\uFEFF'; // UTF-8 BOM for Excel compatibility

        // サマリー情報
        csvContent += '集計結果サマリー\n';
        csvContent += `集計期間,${this.currentFilters.startPeriod} ～ ${this.currentFilters.endPeriod}\n`;
        csvContent += `全体進捗率,${summary.progressRate}%\n`;
        csvContent += `完了タスク,${summary.completedTasks} / ${summary.totalTasks}\n`;
        csvContent += `要注意クライアント,${summary.attentionClients.length}件\n\n`;

        // 進捗マトリクス表
        csvContent += '進捗マトリクス表\n';
        
        // ヘッダー行
        const headers = ['事業者名', '期間内平均進捗率', '完了タスク数', '総タスク数', '担当者', '決算月'];
        
        // 月別ヘッダーを追加
        const startDate = new Date(this.currentFilters.startPeriod + '-01');
        const endDate = new Date(this.currentFilters.endPeriod + '-01');
        for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            headers.push(`${year}年${month}月進捗`);
        }
        
        csvContent += headers.join(',') + '\n';

        // データ行
        matrix.forEach(row => {
            const dataRow = [
                `"${row.clientName}"`,
                `${row.progressRate}%`,
                row.completedTasks,
                row.totalTasks,
                `"${row.staffName}"`,
                `${row.fiscalMonth}月`
            ];

            // 月別データを追加
            for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
                const monthKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                const monthData = row.monthlyProgress[monthKey] || { completed: 0, total: 0, rate: 0 };
                dataRow.push(`${monthData.completed}/${monthData.total} (${monthData.rate}%)`);
            }

            csvContent += dataRow.join(',') + '\n';
        });

        return csvContent;
    }

    generateExcelData() {
        // 簡単なExcel互換形式（実際はCSVと同じ形式だが、より構造化）
        return this.generateCSVData();
    }

    downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    downloadExcel(excelContent, filename) {
        // Excel形式でダウンロード（現在はCSV形式だが、拡張可能）
        const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    getCurrentDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hour = now.getHours().toString().padStart(2, '0');
        const minute = now.getMinutes().toString().padStart(2, '0');
        return `${year}${month}${day}_${hour}${minute}`;
    }
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', async () => {
    window.analytics = new AnalyticsPage();
    await window.analytics.initialize();
});