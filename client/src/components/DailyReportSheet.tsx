import { useLayoutEffect, useRef } from 'react';
import { activityNames, meterSummary, minuteLabel, reportPages, type DailyReport, type DailyRow } from '../lib/dailyReport';
export default function DailyReportSheet({ report, blank = false }: { report: DailyReport; blank?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const meter = meterSummary(report);
  const pages = blank ? [{ start: true, rows: [] }] : reportPages(report.rows);
  useLayoutEffect(() => {
    root.current?.querySelectorAll<HTMLElement>('.daily-paper-content').forEach(node => {
      node.style.zoom = '1';
      const maximum = 265 * 96 / 25.4;
      const scale = Math.min(1, maximum / node.scrollHeight);
      node.style.zoom = String(scale);
      node.style.width = `${100 / scale}%`;
    });
  }, [report, blank]);
  return <div ref={root}>{pages.map((page, index) => {
    const previousRows = index === 0 ? 0 : 17 + (index - 1) * 18;
    const shown: Array<{ start: true } | { row: DailyRow; distance: number | null } | Record<string, never>> = [...(page.start ? [{ start: true as const }] : []), ...page.rows.map((row, i) => ({ row, distance: meter.distances[previousRows + i] }))];
    while (shown.length < 18) shown.push({});
    return <article className="daily-paper" key={index}><div className="daily-paper-content">
      <header><h1>ハイヤー乗務日報{blank ? '（メモ用）' : ''}</h1><span>{blank ? '手書き用' : report.status === 'submitted' ? `提出済み・第${report.version}版` : '下書き'}　{index + 1} / {pages.length}</span></header>
      <div className="daily-paper-grid"><p>運行日<b>{report.date}</b></p><p>乗務員<b>{report.driverName}</b></p><p>車両登録番号<b>{report.vehiclePlate}</b></p><p>営業所<b>{report.office}</b></p><p>勤務開始 / 終了<b>{blank ? '　：　 /　：　' : `${minuteLabel(report.dutyStart, report.date)} / ${minuteLabel(report.dutyEnd, report.date)}`}</b></p><p>出庫 / 帰庫<b>{blank ? '　：　 /　：　' : `${minuteLabel(report.startAt, report.date)} / ${minuteLabel(report.rows[report.rows.length - 1]?.endAt ?? '', report.date)}`}</b></p></div>
      <h2>01　出庫・帰庫と1日の集計</h2>
      <div className="daily-paper-totals"><p>出庫時メーター<b>{blank ? '' : report.startOdometer} km</b></p><p>帰庫時メーター<b>{blank ? '' : meter.endOdometer ?? '未確定'} km</b></p><p>総走行距離<b>{blank ? '' : meter.total ?? '未確定'} km</b></p><p>実車距離 / 件数<b>{blank ? '　km /　件' : `${meter.passenger ?? '未確定'} km / ${report.rows.filter(row => row.kind === 'passenger').length}件`}</b></p></div>
      <h2>02　運行明細{index > 0 ? '（前ページから続き）' : ''}</h2>
      <table><colgroup>{[14,7,14,39,5,12,9].map((n,i) => <col key={i} style={{width: `${n}%`}} />)}</colgroup><thead><tr>{['開始 - 終了','区分','仕事','出発地 → 到着地 / 場所','人数','メーター下3桁','距離（差）'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{shown.map((item, i) => {
        if ('start' in item) return <tr key={i}><td>{blank ? '' : minuteLabel(report.startAt, report.date)}</td><td>出庫</td><td /><td>{blank ? '開始時のメーター →' : report.startPlace}</td><td /><td>{blank ? '' : report.startOdometer ? String(Number(report.startOdometer)%1000).padStart(3,'0') : ''}</td><td>-</td></tr>;
        if (!('row' in item)) return <tr key={i}>{Array.from({length:7},(_,j)=><td key={j} />)}</tr>;
        const {row,distance}=item;
        return <tr key={i}><td>{minuteLabel(row.startAt,report.date)}<br />{minuteLabel(row.endAt,report.date)}</td><td>{activityNames[row.kind]}</td><td>{row.jobLabel}</td><td>{row.from} → {row.to}{row.note && <small>{row.note}</small>}</td><td>{row.passengers}</td><td>{row.meter ? row.meter.padStart(3,'0') : ''}</td><td>{distance ?? '-'}{distance !== null && ' km'}</td></tr>;
      })}</tbody></table>
      <p className="daily-paper-hint">先頭行に開始時の下3桁を記入。以降は直前の値との差で距離を計算。999→000は繰り上げ。</p>
      {index === pages.length-1 && <><h2>03　特記事項</h2><div className="daily-paper-notes">{blank ? '' : report.notes}</div></>}
      <footer>{blank ? 'メモは運行後、スマホ・タブレットの日報へ入力してください。' : `日報 ${report.reportId} / 第${report.version}版`}</footer>
    </div></article>;
  })}</div>;
}
