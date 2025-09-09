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
        
        // 要注意クライアント（進捗率50%未満 または 遅延・停滞ステータス）
        const attentionClients = [];
        clients.forEach(client => {
            const clientMonthlyTasks = tasks.filter(t => t.client_id === client.id);
            let clientTotal = 0;
            let clientCompleted = 0;
            let hasDelayedStatus = false;
            
            clientMonthlyTasks.forEach(monthlyTask => {
                if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                    const tasksList = Object.values(monthlyTask.tasks);
                    clientTotal += tasksList.length;
                    
                    const completedCount = tasksList.filter(task => task === true || task === '完了').length;
                    clientCompleted += completedCount;
                }
                
                // 遅延・停滞ステータスチェック
                if (monthlyTask.status === '遅延' || monthlyTask.status === '停滞') {
                    hasDelayedStatus = true;
                }
            });
            
            const clientProgressRate = clientTotal > 0 ? (clientCompleted / clientTotal) * 100 : 0;
            
            // 進捗率50%未満 または 遅延・停滞ステータスがある場合
            if ((clientProgressRate < 50 && clientTotal > 0) || hasDelayedStatus) {
                const reason = hasDelayedStatus ? '遅延・停滞' : '進捗率低下';
                attentionClients.push({
                    name: client.name,
                    progressRate: Math.round(clientProgressRate),
                    reason: reason
                });
            }
        });
        
        // ステータス別構成を計算
        const statusComposition = this.calculateStatusComposition(tasks);
        
        return {
            progressRate,
            completedTasks,
            totalTasks,
            attentionClients,
            statusComposition
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
            this.displayAttentionClients(summary.attentionClients);
            attentionContainer.style.display = 'block';
        } else {
            attentionContainer.style.display = 'none';
        }

        // ステータス別構成円グラフを描画
        this.drawStatusChart(summary.statusComposition);
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

    exportToPDF() {
        if (!this.lastAnalysisData) {
            showToast('先に集計を実行してください', 'warning');
            return;
        }

        try {
            this.generatePDFReport();
            showToast('PDF形式でエクスポートしました', 'success');
            document.getElementById('export-menu').style.display = 'none';
        } catch (error) {
            console.error('PDF export failed:', error);
            showToast('PDFエクスポートに失敗しました', 'error');
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
        csvContent += `要注意クライアント,${summary.attentionClients.length}件\n`;
        
        // 要注意クライアント詳細
        if (summary.attentionClients.length > 0) {
            csvContent += '要注意クライアント詳細\n';
            csvContent += 'クライアント名,理由,進捗率\n';
            summary.attentionClients.forEach(client => {
                csvContent += `"${client.name}",${client.reason},${client.progressRate}%\n`;
            });
        }
        csvContent += '\n';

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
        const { summary, matrix } = this.lastAnalysisData;
        
        // Excelワークブック作成
        const workbook = XLSX.utils.book_new();
        
        // サマリーシート
        const summarySheet = this.createSummarySheet(summary);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'サマリー');
        
        // 進捗マトリクスシート
        const matrixSheet = this.createMatrixSheet(matrix);
        XLSX.utils.book_append_sheet(workbook, matrixSheet, '進捗マトリクス');
        
        return workbook;
    }
    
    createSummarySheet(summary) {
        const data = [
            ['集計結果サマリー'],
            [''],
            ['集計期間', `${this.currentFilters.startPeriod} ～ ${this.currentFilters.endPeriod}`],
            ['全体進捗率', `${summary.progressRate}%`],
            ['完了タスク', `${summary.completedTasks} / ${summary.totalTasks}`],
            ['要注意クライアント', `${summary.attentionClients.length}件`],
            [''],
            ['要注意クライアント詳細'],
            ['クライアント名', '理由', '進捗率']
        ];
        
        // 要注意クライアント詳細を追加
        summary.attentionClients.forEach(client => {
            data.push([client.name, client.reason, `${client.progressRate}%`]);
        });
        
        return XLSX.utils.aoa_to_sheet(data);
    }
    
    createMatrixSheet(matrix) {
        const data = [];
        
        // ヘッダー行作成
        const periods = Object.keys(matrix[0].monthlyProgress || {}).sort();
        const headers = ['事業者名', '担当者', '全体進捗率', ...periods];
        data.push(headers);
        
        // データ行作成
        matrix.forEach(client => {
            const row = [
                client.name,
                client.staffName || '',
                this.formatProgressForExcel(client.completedTasks, client.totalTasks)
            ];
            
            // 各月の進捗を分数形式で追加（日付と間違われないように対策）
            periods.forEach(period => {
                const monthData = client.monthlyProgress?.[period];
                if (monthData) {
                    row.push(this.formatProgressForExcel(monthData.completed, monthData.total));
                } else {
                    row.push('');
                }
            });
            
            data.push(row);
        });
        
        return XLSX.utils.aoa_to_sheet(data);
    }
    
    formatProgressForExcel(completed, total) {
        if (!total || total === 0) return '';
        
        // 日付と間違われないように対策：
        // 1. 前後にスペースを入れる
        // 2. 文字列として明示的にフォーマット
        return ` ${completed}/${total} `;
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

    downloadExcel(workbook, filename) {
        // SheetJSでワークブックをExcelバイナリに変換
        const excelBuffer = XLSX.write(workbook, { 
            bookType: 'xlsx', 
            type: 'array',
            compression: true
        });
        
        // 正しいMIMEタイプでダウンロード
        const blob = new Blob([excelBuffer], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
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

    generatePDFReport() {
        // PDF用のレポート内容を生成
        const { summary, matrix } = this.lastAnalysisData;
        
        // 新しいウィンドウでPDF用のレポートページを開く
        const printWindow = window.open('', '_blank');
        
        const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>進捗分析結果レポート - ${this.getCurrentDateString()}</title>
            <style>
                @page { 
                    size: A4; 
                    margin: 20mm;
                }
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body { 
                    font-family: 'MS Gothic', monospace, sans-serif; 
                    font-size: 12px; 
                    line-height: 1.6;
                    color: #333;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #007bff;
                }
                .header h1 {
                    font-size: 24px;
                    color: #007bff;
                    margin-bottom: 10px;
                }
                .header .date {
                    font-size: 14px;
                    color: #666;
                }
                .summary-section {
                    margin-bottom: 30px;
                }
                .summary-section h2 {
                    font-size: 16px;
                    color: #333;
                    margin-bottom: 15px;
                    padding-left: 10px;
                    border-left: 4px solid #28a745;
                }
                .summary-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 15px;
                    margin-bottom: 20px;
                }
                .summary-card {
                    border: 1px solid #dee2e6;
                    border-radius: 4px;
                    padding: 15px;
                    text-align: center;
                }
                .summary-card .label {
                    font-size: 11px;
                    color: #666;
                    margin-bottom: 5px;
                }
                .summary-card .value {
                    font-size: 18px;
                    font-weight: bold;
                    color: #007bff;
                }
                .attention-clients {
                    margin-top: 15px;
                }
                .attention-clients ul {
                    list-style: none;
                    background: #fff3cd;
                    padding: 10px 15px;
                    border-radius: 4px;
                    border-left: 4px solid #ffc107;
                }
                .attention-clients li {
                    padding: 2px 0;
                    font-size: 11px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                    font-size: 10px;
                }
                th, td {
                    border: 1px solid #dee2e6;
                    padding: 8px;
                    text-align: center;
                }
                th {
                    background-color: #f8f9fa;
                    font-weight: bold;
                }
                .progress-high { color: #28a745; font-weight: bold; }
                .progress-medium { color: #ffc107; font-weight: bold; }
                .progress-low { color: #dc3545; font-weight: bold; }
                .page-break { page-break-before: always; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📊 進捗分析結果レポート</h1>
                <div class="date">作成日時: ${new Date().toLocaleString('ja-JP')}</div>
                <div class="date">集計期間: ${this.currentFilters.startPeriod} ～ ${this.currentFilters.endPeriod}</div>
            </div>
            
            <div class="summary-section">
                <h2>📈 集計結果サマリー</h2>
                <div class="summary-grid">
                    <div class="summary-card">
                        <div class="label">全体進捗率</div>
                        <div class="value">${summary.progressRate}%</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">完了タスク</div>
                        <div class="value">${summary.completedTasks} / ${summary.totalTasks}</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">要注意クライアント</div>
                        <div class="value">${summary.attentionClients.length}件</div>
                    </div>
                </div>
                
                ${summary.attentionClients.length > 0 ? `
                <div class="attention-clients">
                    <h3 style="margin-bottom: 10px;">⚠️ 要注意クライアント一覧</h3>
                    <ul>
                        ${summary.attentionClients.map(client => 
                            `<li>${client.name} (${client.reason}: ${client.progressRate}%)</li>`
                        ).join('')}
                    </ul>
                </div>` : ''}
            </div>
            
            <div class="page-break"></div>
            
            <div class="summary-section">
                <h2>📋 進捗マトリクス表</h2>
                <table>
                    <thead>
                        <tr>
                            <th>事業者名</th>
                            <th>進捗率</th>
                            <th>完了/総数</th>
                            <th>担当者</th>
                            <th>決算月</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${matrix.map(row => `
                        <tr>
                            <td style="text-align: left; font-weight: bold;">${row.clientName}</td>
                            <td class="${row.progressRate >= 80 ? 'progress-high' : row.progressRate >= 50 ? 'progress-medium' : 'progress-low'}">${row.progressRate}%</td>
                            <td>${row.completedTasks}/${row.totalTasks}</td>
                            <td>${row.staffName}</td>
                            <td>${row.fiscalMonth}月</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </body>
        </html>`;
        
        printWindow.document.write(printContent);
        printWindow.document.close();
        
        // PDFとして印刷
        printWindow.onload = function() {
            printWindow.print();
            printWindow.onafterprint = function() {
                printWindow.close();
            };
        };
    }

    calculateStatusComposition(tasks) {
        let completedTasks = 0;
        let inProgressTasks = 0;
        let delayedTasks = 0;
        
        tasks.forEach(monthlyTask => {
            if (monthlyTask.tasks && typeof monthlyTask.tasks === 'object') {
                const tasksList = Object.values(monthlyTask.tasks);
                const completedCount = tasksList.filter(status => status === true || status === '完了').length;
                const totalCount = tasksList.length;
                
                // ステータスの判定ロジック
                const isDelayedMonth = monthlyTask.status === '遅延' || monthlyTask.status === '停滞';
                const isNoProgress = completedCount === 0 && totalCount > 0; // 0/5のような場合
                const isFullyCompleted = completedCount === totalCount && totalCount > 0;
                
                tasksList.forEach(taskStatus => {
                    if (isDelayedMonth || isNoProgress) {
                        // 遅延・停滞月のタスク または 0/X進捗のタスクは遅延扱い
                        delayedTasks++;
                    } else if (isFullyCompleted) {
                        // 完全に完了した月のタスクは完了扱い
                        completedTasks++;
                    } else if (taskStatus === true || taskStatus === '完了') {
                        // 部分完了月の完了タスク
                        completedTasks++;
                    } else {
                        // 部分完了月の未完了タスク
                        inProgressTasks++;
                    }
                });
            }
        });
        
        const total = completedTasks + inProgressTasks + delayedTasks;
        
        return {
            completed: completedTasks,
            inProgress: inProgressTasks,
            delayed: delayedTasks,
            total,
            completedPercentage: total > 0 ? Math.round((completedTasks / total) * 100) : 0,
            inProgressPercentage: total > 0 ? Math.round((inProgressTasks / total) * 100) : 0,
            delayedPercentage: total > 0 ? Math.round((delayedTasks / total) * 100) : 0
        };
    }

    drawStatusChart(statusData) {
        const canvas = document.getElementById('status-chart');
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 20;

        // キャンバスをクリア
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (statusData.total === 0) {
            // データがない場合の表示
            ctx.fillStyle = '#e0e0e0';
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.fillStyle = '#999';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('データなし', centerX, centerY);
            
            document.getElementById('chart-legend').innerHTML = '<div style="color: #999;">データがありません</div>';
            return;
        }

        // 色設定
        const colors = {
            completed: '#28a745',    // 緑
            inProgress: '#ffc107',   // 黄
            delayed: '#dc3545'       // 赤
        };

        // 角度計算
        const data = [
            { label: '完了', count: statusData.completed, percentage: statusData.completedPercentage, color: colors.completed },
            { label: '進行中', count: statusData.inProgress, percentage: statusData.inProgressPercentage, color: colors.inProgress },
            { label: '遅延・停滞', count: statusData.delayed, percentage: statusData.delayedPercentage, color: colors.delayed }
        ];

        let currentAngle = -Math.PI / 2; // 12時の位置から開始

        // 円グラフ描画
        data.forEach(segment => {
            if (segment.count > 0) {
                const sliceAngle = (segment.count / statusData.total) * 2 * Math.PI;
                
                ctx.fillStyle = segment.color;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
                ctx.closePath();
                ctx.fill();

                // 境界線
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();

                currentAngle += sliceAngle;
            }
        });

        // 凡例作成（縦並び）
        const legend = data.map(segment => 
            `<div style="display: flex; align-items: center; margin-bottom: 6px; line-height: 1.4;">
                <span style="display: inline-block; width: 12px; height: 12px; background: ${segment.color}; margin-right: 8px; border-radius: 2px; flex-shrink: 0;"></span>
                <span style="font-size: 11px;"><strong>${segment.label}:</strong><br>${segment.count}件 (${segment.percentage}%)</span>
            </div>`
        ).join('');

        document.getElementById('chart-legend').innerHTML = legend;

        // 担当者フィルター情報を追加
        const staffFilter = this.currentFilters.staffId;
        if (staffFilter && staffFilter !== '') {
            const selectedStaff = this.staffs.find(s => s.id == staffFilter);
            if (selectedStaff) {
                document.getElementById('chart-legend').innerHTML += 
                    `<div style="margin-top: 8px; font-size: 11px; color: #666;">担当者: ${selectedStaff.name}</div>`;
            }
        }
    }

    displayAttentionClients(attentionClients) {
        const attentionList = document.getElementById('attention-clients-list');
        const maxInitialDisplay = 10;
        
        // 初期表示（最大10件）
        const initialClients = attentionClients.slice(0, maxInitialDisplay);
        const remainingClients = attentionClients.slice(maxInitialDisplay);
        
        let listHTML = initialClients
            .map(client => `<li>${client.name} (${client.reason}: ${client.progressRate}%)</li>`)
            .join('');
        
        // 10件以上ある場合は「全て表示」ボタンを追加
        if (remainingClients.length > 0) {
            const allClientsHTML = attentionClients
                .map(client => `<li>${client.name} (${client.reason}: ${client.progressRate}%)</li>`)
                .join('');
            
            listHTML += `
                <li style="margin-top: 10px; text-align: center;">
                    <button onclick="analytics.showAllAttentionClients('${encodeURIComponent(allClientsHTML)}')" 
                            style="background: #17a2b8; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        残り${remainingClients.length}件を表示 (全${attentionClients.length}件)
                    </button>
                </li>`;
        }
        
        attentionList.innerHTML = listHTML;
    }

    showAllAttentionClients(encodedHTML) {
        const attentionList = document.getElementById('attention-clients-list');
        const allClientsHTML = decodeURIComponent(encodedHTML);
        
        attentionList.innerHTML = allClientsHTML + `
            <li style="margin-top: 10px; text-align: center;">
                <button onclick="analytics.hideExtraAttentionClients()" 
                        style="background: #6c757d; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    最初の10件のみ表示
                </button>
            </li>`;
    }

    hideExtraAttentionClients() {
        // 最新のデータで再表示
        if (this.lastAnalysisData && this.lastAnalysisData.summary.attentionClients) {
            this.displayAttentionClients(this.lastAnalysisData.summary.attentionClients);
        }
    }
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', async () => {
    window.analytics = new AnalyticsPage();
    await window.analytics.initialize();
});