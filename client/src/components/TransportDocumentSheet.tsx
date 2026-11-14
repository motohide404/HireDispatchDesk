import { useLayoutEffect, useRef } from 'react';
import { displayTime } from '../lib/dutyLog';
import { applicationMethods, documentNames, type DocumentValues, type TransportDocument } from '../lib/transportDocuments';

const text = (value?: string) => value?.trim() || '—';
const money = (value: string) => /^\d+$/.test(value) ? `${Number(value).toLocaleString('ja-JP')}円` : text(value);

export function fitDocumentToA4(element: HTMLElement) {
  const originalWidth = element.style.width;
  const originalZoom = element.style.getPropertyValue('zoom');
  const heightAt = (scale: number) => {
    element.style.width = `${190 / scale}mm`;
    element.style.setProperty('zoom', String(scale));
    return element.getBoundingClientRect().height;
  };
  const available = 274 * 96 / 25.4;
  let scale = 1;
  if (heightAt(1) > available) {
    let low = .02, high = 1;
    for (let step = 0; step < 14; step++) {
      const middle = (low + high) / 2;
      if (heightAt(middle) <= available) low = middle;
      else high = middle;
    }
    scale = Math.floor(low * 1000) / 1000;
  }
  element.style.width = originalWidth;
  element.style.setProperty('zoom', originalZoom);
  element.style.setProperty('--document-print-scale', String(scale));
  element.style.setProperty('--document-print-width', `${190 / scale}mm`);
}

function Schedule({ values, passenger = false }: { values: DocumentValues; passenger?: boolean }) {
  const rows = passenger
    ? [['乗車', values.boardingPlace, values.boardingAt], ['降車', values.alightingPlace, values.alightingAt]]
    : [['出庫・運行開始', values.operationStartPlace, values.operationStartAt], ['帰庫・運行終了', values.operationEndPlace, values.operationEndAt]];
  return <table className="document-schedule"><colgroup><col className="schedule-label" /><col /><col className="schedule-time" /></colgroup><thead><tr><th scope="col">区分</th><th scope="col">地点</th><th scope="col">日時</th></tr></thead><tbody>{rows.map(([label, place, at]) => <tr key={label}><th scope="row">{label}</th><td>{text(place)}</td><td className="document-time">{at ? displayTime(at) : '—'}</td></tr>)}</tbody></table>;
}

function Block({ number, title, children, className = '' }: { number: string; title: string; children: React.ReactNode; className?: string }) {
  return <section className={`document-block ${className}`}><h2><span>{number}</span>{title}</h2>{children}</section>;
}

export function TransportDocumentSheet({ record, outdated = false }: { record: TransportDocument; outdated?: boolean }) {
  const sheet = useRef<HTMLElement>(null);
  const v = record.values;
  const acceptance = record.kind === 'acceptance';
  useLayoutEffect(() => {
    const element = sheet.current;
    if (!element) return;
    // Fit the entire sheet, without removing or clipping saved text. The fixed
    // paper width makes the result independent of the screen's viewport.
    let active = true;
    const fit = () => { if (active) fitDocumentToA4(element); };
    fit();
    document.fonts?.ready.then(fit);
    window.addEventListener('beforeprint', fit);
    return () => { active = false; window.removeEventListener('beforeprint', fit); };
  }, [record, outdated]);

  return <article ref={sheet} className={`transport-document document-${record.kind}`} aria-label={`${documentNames[record.kind]}の印刷用紙`}>
    <header className="document-heading">
      <p className="document-number">帳票番号：{record.number}</p>
      <h1>{documentNames[record.kind]}</h1>
      <p className="document-issued">作成：{displayTime(record.createdAt)} ／ {record.issuerStaffName}</p>
      {(record.voided || outdated) && <p className="document-version">【{record.voided ? '取消済み' : '旧版・訂正前'}】</p>}
    </header>
    <p className="document-job"><strong>件名</strong><span>{text(record.source.title)}</span></p>

    {!acceptance && <div className="document-company-line"><span><b>事業者</b> {text(v.issuerName)}</span><span><b>営業所</b> {text(v.officeName)}</span>{v.issuerPhone && <span><b>事業者連絡先</b> {v.issuerPhone}</span>}</div>}
    {!acceptance && <Block number="01" title="運転者・車両"><div className="document-crew"><div><span>運転者の氏名</span><strong>{text(record.driverName)}</strong></div><div><span>自動車登録番号</span><strong>{text(record.vehiclePlate)}</strong></div></div></Block>}

    <Block number={acceptance ? '01' : '02'} title={acceptance ? '運送の申込者' : '運送契約の相手方'}>
      <dl className="document-fields"><div><dt>氏名・名称</dt><dd className="document-client-name">{text(v.applicantName)}{v.applicantType && <span className="document-type">{v.applicantType}</span>}</dd></div><div><dt>連絡先</dt><dd>{text(v.applicantContact)}</dd></div>{acceptance && <div><dt>申込方法</dt><dd>{applicationMethods[v.applicationMethod as keyof typeof applicationMethods] || text(v.applicationMethod)}{v.methodDetail && ` ／ ${v.methodDetail}`}</dd></div>}</dl>
    </Block>

    <Block number={acceptance ? '02' : '03'} title="運行の開始・終了（回送を含む）">
      <p className="document-time-status">{v.timeStatus === 'confirmed' ? '確定日時' : '予定日時'}</p><Schedule values={v} />
    </Block>
    <Block number={acceptance ? '03' : '04'} title="旅客の乗車・降車"><Schedule values={v} passenger /></Block>

    {acceptance ? <>
      <Block number="04" title="運賃・料金（税込）">
        <div className="document-fares"><p><span>運賃</span><strong>{money(v.fare)}</strong></p><p><span>料金</span><strong>{money(v.charge)}</strong></p><p className="document-total"><span>合計（税込）</span><strong>{(Number(v.fare) + Number(v.charge)).toLocaleString('ja-JP')}円</strong><small>{v.priceStatus === 'estimate' ? '概算額' : '確定額'}</small></p></div>
        {v.chargeDetails && <dl className="document-fields"><div><dt>料金の内訳</dt><dd>{v.chargeDetails}</dd></div></dl>}
        {v.priceBasis && <dl className="document-fields"><div><dt>概算額の根拠</dt><dd>{v.priceBasis}</dd></div></dl>}
      </Block>
      {v.notes && <Block number="05" title="その他の事項"><p className="document-prose">{v.notes}</p></Block>}
      <footer className="document-acceptance-footer"><p className="document-acceptance-statement">上記のとおり運送を引き受けます。</p><div className="document-issuer"><h2>運送引受者</h2><p className="document-issuer-name">{text(v.issuerName)}<span>{text(v.officeName)}</span></p><dl className="document-fields"><div><dt>住所</dt><dd>{text(v.issuerAddress)}</dd></div><div><dt>電話・連絡先</dt><dd>{text(v.issuerPhone)}</dd></div><div><dt>緊急連絡先</dt><dd>{text(v.emergencyContact)}</dd></div><div><dt>営業区域</dt><dd>{text(v.serviceArea)}</dd></div></dl></div></footer>
    </> : <>
      <Block number="05" title="運行の経路・安全確保のための指示" className="document-safety"><dl className="document-fields">{([['route', '経路・立寄り・待機'], ['safetyInstructions', '安全上の指示'], ['notes', 'その他の事項']] as const).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{text(v[key])}</dd></div>)}</dl></Block>
      <section className="document-confirmation"><h2>指示・確認欄</h2><div><p><b>運行管理者　指示</b><span>日時：　　　　　　年　　　月　　　日　　　時　　　分</span><span>氏名：　　　　　　　　　　　　　　　　　印</span></p><p><b>運転者　確認</b><span>日時：　　　　　　年　　　月　　　日　　　時　　　分</span><span>氏名：　　　　　　　　　　　　　　　　　印</span></p></div></section>
    </>}
    {record.reason && <p className="document-reason"><b>訂正・取消理由：</b>{record.reason}</p>}
    <p className="document-record-id">記録ID：{record.id}</p>
  </article>;
}
