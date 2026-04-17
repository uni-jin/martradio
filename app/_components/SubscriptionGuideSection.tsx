export function SubscriptionGuideSection() {
  return (
    <section className="mt-8 text-sm text-stone-700">
      <h2 className="text-lg font-semibold text-stone-800">구독 안내</h2>

      <div className="mt-4 space-y-4 text-sm leading-relaxed text-stone-700">
        <div>
          <h3 className="text-base font-semibold text-stone-800">1. 결제 및 갱신</h3>
          <p className="mt-1">유료 구독은 월 단위로 제공됩니다.</p>
          <p>구독 요금은 최초 결제일의 &apos;일&apos;을 기준으로 매월 같은 날짜에 자동 결제됩니다.</p>
          <p>해당 월에 그 날짜가 없으면 그 달의 말일에 결제되며, 다음 달부터는 다시 기준일에 맞춰 결제됩니다.</p>
          <p>결제일이 없는 달에는 말일에 결제됩니다.</p>
          <p>(예: 5월 31일 결제 → 6월 30일 자동 결제 → 7월 31일 자동 결제)</p>
          <p>(예: 3월 5일 결제 → 4월 5일 자동 결제)</p>
          <p>구독은 해지하지 않는 한 자동으로 갱신됩니다.</p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-stone-800">2. 구독 변경 (업그레이드 / 다운그레이드)</h3>
          <p className="mt-1">1) 상위 구독으로 변경 (기본 방송 → 무제한 방송)</p>
          <p>즉시 상위 구독이 적용됩니다.</p>
          <p>남은 기간에 대해 차액이 일할 계산되어 추가 결제됩니다.</p>
          <p className="mt-1">등록된 카드가 있으면 카드 번호를 다시 입력하지 않고 결제됩니다.</p>
          <p className="mt-1">2) 하위 구독으로 변경 (무제한 방송 → 기본 방송)</p>
          <p>다음 결제일부터 하위 구독이 적용됩니다.</p>
          <p>현재 이용 기간 동안은 기존 구독이 유지됩니다.</p>
          <p>추가 결제 없이 예약만 하며, 등록된 카드가 있으면 카드 입력 없이 처리됩니다.</p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-stone-800">3. 해지 정책</h3>
          <p className="mt-1">구독은 언제든지 해지할 수 있습니다.</p>
          <p>해지 시 다음 결제일부터 요금이 청구되지 않습니다.</p>
          <p>예약된 하위 구독 변경이 있으면 해지와 함께 취소됩니다.</p>
          <p>해지 후에도 현재 결제 기간 종료일까지는 서비스를 이용할 수 있습니다.</p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-stone-800">4. 환불 정책</h3>
          <p className="mt-1">결제 완료 후 환불은 제공되지 않습니다.</p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-stone-800">5. 사용 제한 안내</h3>
          <p className="mt-1">
            구독 유형에 따라 방송문 글자 수 및 저장 가능한 방송 수에 제한이 있습니다.
          </p>
          <p>제한 초과 시 추가 생성 또는 저장이 불가할 수 있습니다.</p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-stone-800">6. 데이터 보관</h3>
          <p className="mt-1">구독 변경 또는 해지 시 저장된 방송이 일부 제한될 수 있습니다.</p>
          <p>(예: 저장 개수 제한 초과 시 일부 방송이 비활성화될 수 있음)</p>
        </div>
      </div>
    </section>
  );
}
