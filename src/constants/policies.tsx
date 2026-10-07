import React from 'react';
import { Settings, ShieldCheck, BarChart3, AlertCircle } from 'lucide-react';

const Divider = () => <div className="h-[1px] bg-current opacity-10 my-8" />;

export const policies = {
  terms: {
    title: '이용약관 (Metalora Terms v26.10.06)',
    content: (
      <div className="font-sans pb-8">
        <div className="bg-white dark:bg-zinc-900/40 p-6 rounded-2xl mb-10 border border-zinc-200 dark:border-white/5 shadow-sm">
          <p className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-200 font-semibold">
            메탈로라의 상품은 <span className="text-purple-600 dark:text-purple-400">일반 카탈로그 상품</span>과 <span className="text-purple-600 dark:text-purple-400">WORKSHOP 맞춤 제작</span>으로 구분됩니다.<br/>
            일반 상품은 상품 수령 후 7일 이내 청약철회가 가능합니다. WORKSHOP은 고객이 제공한 이미지를 바탕으로 개별 제작되며, 이미지 검수 및 제작 승인 전에는 취소할 수 있습니다.
          </p>
        </div>

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제1조 (목적)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>본 약관은 메탈로라(이하 "회사")가 제공하는 일반 카탈로그 상품 판매 및 WORKSHOP 맞춤 제작 서비스(이하 "서비스")의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제2조 (정의)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ul className="list-disc pl-5 space-y-3">
            <li><span className="font-medium text-zinc-950 dark:text-white">"이용자"</span>란 본 약관에 따라 회사가 제공하는 서비스를 이용하는 자를 말합니다.</li>
            <li><span className="font-medium text-zinc-950 dark:text-white">"일반 상품"</span>이란 회사가 카탈로그로 판매하는 상품으로, 고객 이미지 업로드나 개인화가 없습니다. 주문 후 회사가 제작·검수한다는 사실만으로 개별 주문제작 상품으로 보지 않습니다.</li>
            <li><span className="font-medium text-zinc-950 dark:text-white">"WORKSHOP"</span>이란 이용자가 자신의 이미지를 업로드하여 개별 제작을 의뢰하는 맞춤 제작 서비스입니다. 이미지는 자동 승인되지 않으며, 회사의 검수 후 제작이 승인됩니다.</li>
            <li><span className="font-medium text-zinc-950 dark:text-white">"서비스"</span>란 일반 상품 판매와 WORKSHOP을 포함하여 회사가 제공하는 일체의 서비스를 의미합니다.</li>
            <li><span className="font-medium text-zinc-950 dark:text-white">"콘텐츠"</span>란 WORKSHOP 이용 과정에서 이용자가 업로드하거나 생성한 이미지, 텍스트 등 자료를 의미합니다.</li>
          </ul>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제3조 (약관의 효력 및 변경)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>본 약관은 서비스 화면에 게시하거나 기타 방법으로 공지함으로써 효력이 발생합니다.</li>
            <li>회사는 관련 법령을 위반하지 않는 범위에서 본 약관을 변경할 수 있으며, 변경 시 사전 공지합니다.</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제4조 (서비스의 제공 및 변경)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>회사는 일반 카탈로그 상품과 WORKSHOP 맞춤 제작 상품을 제공합니다.</li>
            <li>일반 상품은 고객 이미지 업로드나 개인화 없이 제공됩니다. 주문 접수 후 회사가 제작·검수·포장하여 배송하더라도, 그 사실만으로 개별 주문제작 상품으로 분류하지 않습니다.</li>
            <li>WORKSHOP은 이용자가 업로드한 이미지를 바탕으로 개별 제작됩니다. 이미지는 자동 승인되지 않으며, 회사의 검수 후 제작이 승인됩니다.</li>
            <li>회사는 기술적 사양 변경, 운영상 필요 등에 따라 서비스 내용을 변경할 수 있습니다.</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제5조 (계약의 성립)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>이용자가 주문 내용을 확인하고 결제를 완료한 시점에 계약이 성립합니다. WORKSHOP은 이미지 검수 결과에 따라 제작이 승인되거나 거절될 수 있습니다. 회사는 다음의 경우 주문을 거절하거나 취소할 수 있습니다.</p>
          <ol className="list-decimal pl-5 space-y-3">
            <li>권리 침해가 우려되는 콘텐츠</li>
            <li>법령에 위반되는 콘텐츠</li>
            <li>기술적으로 제작이 불가능한 경우</li>
            <li>기타 회사의 운영 정책상 필요하다고 판단되는 경우</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제6조 (이용자의 의무)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>WORKSHOP 이용 시 이용자는 다음 행위를 하여서는 안 됩니다.</p>
          <ol className="list-decimal pl-5 space-y-3">
            <li>타인의 저작권, 초상권, 퍼블리시티권 등 권리를 침해하는 콘텐츠 업로드</li>
            <li>타인의 개인정보를 무단으로 포함한 콘텐츠 업로드</li>
            <li>허위 정보 입력</li>
            <li>서비스 운영을 방해하는 행위</li>
            <li>기타 관련 법령에 위반되는 행위</li>
          </ol>
          <p>이용자는 본인이 업로드한 콘텐츠에 대한 모든 권리 및 책임이 본인에게 있음을 보증합니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제7조 (콘텐츠에 대한 권리 및 책임)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>이용자가 WORKSHOP에 업로드한 콘텐츠에 대한 저작권 및 기타 권리는 이용자에게 귀속됩니다.</li>
            <li>이용자는 해당 콘텐츠가 제3자의 권리를 침해하지 않음을 보증합니다.</li>
            <li>회사는 서비스 제공을 위해 필요한 범위 내에서 콘텐츠를 이용할 수 있습니다.</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제8조 (면책 및 책임 제한)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>이용자가 업로드한 콘텐츠로 인해 발생하는 저작권, 초상권, 개인정보 침해 등 모든 법적 책임은 이용자에게 있습니다.</li>
            <li>이용자의 위반 행위로 인해 회사가 제3자로부터 손해배상 청구, 소송, 형사 고발 등을 당할 경우, 이용자는 회사에 발생한 모든 손해를 배상하여야 합니다.</li>
            <li>본 조에 따른 손해에는 변호사 비용, 합의금, 배상금, 기타 법적 대응에 소요된 비용이 포함됩니다.</li>
            <li>회사는 이용자가 제공한 콘텐츠의 적법성에 대해 보증하지 않으며, 이에 따른 분쟁에 대해 책임을 부담하지 않습니다.</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제9조 (책임의 한계)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>회사는 다음 사유로 인한 손해에 대해 책임을 지지 않습니다.</p>
          <ol className="list-decimal pl-5 space-y-3">
            <li>이용자의 귀책사유로 인한 문제</li>
            <li>이용자가 제공한 콘텐츠 자체의 문제</li>
            <li>불가항력(천재지변, 시스템 장애 등)에 의한 서비스 중단</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제10조 (분쟁 해결 및 관할 법원)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>본 약관에 명시되지 않은 사항은 관련 법령 및 상관례에 따릅니다.<br/>서비스 이용과 관련하여 발생한 분쟁에 대한 관할 법원은 민사소송법에 따릅니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">부칙</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <p>본 약관은 2026년 10월 6일부터 시행됩니다.</p>
        </div>
      </div>
    )
  },
  refund: {
    title: '환불 및 교환 정책 (Metalora Brand Policy v26.10.06)',
    content: (
      <div className="font-sans pb-8">
        <div className="bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/5 text-zinc-900 dark:text-zinc-200 p-6 rounded-2xl font-semibold mb-10 leading-relaxed text-[15px]">
          메탈로라는 <span className="font-bold text-purple-600 dark:text-purple-400">일반 상품</span>과 <span className="font-bold text-purple-600 dark:text-purple-400">WORKSHOP 맞춤 제작</span>을 구분하여 안내합니다. 일반 상품은 상품 수령 후 7일 이내 청약철회가 가능합니다. WORKSHOP은 이미지 검수 및 제작 승인 전에는 취소할 수 있으며, 제작 승인 이후에는 사전 안내 및 동의한 범위에서 단순변심에 의한 청약철회가 제한될 수 있습니다. 불량·파손·오배송에 대한 교환·환불 권리는 유지됩니다.
        </div>

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제1조 (청약철회 및 주문 취소)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ol className="list-decimal pl-5 mt-2 space-y-3">
            <li>
              <span className="font-medium text-zinc-950 dark:text-white">일반 상품.</span> 상품 수령 후 7일 이내 청약철회가 가능합니다. 단순변심에 따른 반품 배송비는 구매자가 부담합니다.
            </li>
            <li>
              <span className="font-medium text-zinc-950 dark:text-white">WORKSHOP.</span> 고객이 제공한 이미지를 바탕으로 개별 제작됩니다. 이미지 검수 및 제작 승인 전에는 취소할 수 있습니다. 제작 승인 이후에는 사전 안내 및 동의한 범위에서 단순변심에 의한 청약철회가 제한될 수 있습니다.
            </li>
            <li>
              상품의 불량, 파손, 오배송, 표시·광고와 다른 경우는 일반 상품과 WORKSHOP 모두 교환 또는 환불이 가능하며, 이때 배송비는 회사가 부담합니다.
            </li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제2조 (교환 및 환불이 가능한 경우)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>다음의 경우 교환 및 환불이 가능합니다.</p>
          <ol className="list-decimal pl-5 mt-2 space-y-3">
            <li>일반 상품의 단순변심: 상품 수령일로부터 7일 이내. 반품 배송비는 구매자 부담입니다.</li>
            <li>배송된 상품의 <span className="font-bold text-zinc-950 dark:text-white">명백한 파손 또는 불량</span>이 확인된 경우</li>
            <li>주문한 사양과 실제 배송된 상품이 다른 <span className="font-bold text-zinc-950 dark:text-white">오배송</span>의 경우</li>
            <li>상품 정보와 실제 제품의 내용이 현저히 다른 경우</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제3조 (교환 및 환불이 제한되는 경우)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>아래 사유는 제품의 결함으로 보지 않으며, 교환 및 환불이 제한될 수 있습니다.</p>
          <ol className="list-decimal pl-5 mt-2 space-y-3">
            <li><span className="font-bold text-zinc-950 dark:text-white">색상 차이</span>: 모니터 및 모바일 기기 환경(밝기, 색상 설정 등)에 따른 색상 차이</li>
            <li><span className="font-bold text-zinc-950 dark:text-white">이미지 품질</span>: WORKSHOP에서 고객이 업로드한 원본 파일의 해상도 부족, 노이즈, 초점 불량 등</li>
            <li><span className="font-bold text-zinc-950 dark:text-white">마감 오차</span>: 공정상 발생할 수 있는 1~2mm 내외의 재단 오차 및 미세한 스크래치</li>
            <li>고객 책임 사유: 상품 수령 후 고객의 부주의로 인한 훼손 또는 사용 흔적이 있는 경우</li>
            <li>WORKSHOP에서 제작 승인 이후의 단순변심: 사전 안내 및 동의한 범위에서 청약철회가 제한될 수 있습니다. 일반 상품의 단순변심 청약철회는 제1조에 따릅니다.</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제4조 (검수 및 책임 범위)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>WORKSHOP 이미지는 제작 전 검수합니다. 검수는 제작 가능 여부 확인을 위한 것이며, 저작권·초상권의 최종 책임은 이용자에게 있습니다.</li>
            <li>업로드된 이미지의 저작권, 초상권 및 사용 권한에 대한 책임은 전적으로 이용자에게 있습니다.</li>
            <li>원본 이미지 품질 및 해상도에 따른 결과물 차이는 제품 하자로 보지 않을 수 있습니다.</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제5조 (CS 처리 절차)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>반품·교환·문의는 상품 수령일로부터 7일 이내 홈페이지 1:1 문의 또는 이메일로 접수해 주세요. 접수 후 반품 방법과 주소를 안내드립니다.</p>
          <ul className="list-disc pl-5 mt-2 space-y-2">
            <li>이메일: <span className="font-bold">a84411448@gmail.com</span></li>
            <li>운영시간: 평일 10:00~17:00 (점심 12:00~13:00), 토·일·공휴일 휴무</li>
            <li>운영시간 내 순차적으로 답변드립니다.</li>
            <li>접수 시 문제 확인을 위한 사진(제품 전체, 문제 부위, 포장 상태 등)을 함께 제출해주셔야 원활한 처리가 가능합니다.</li>
            <li>파손의 경우 택배 박스 및 송장 사진을 함께 제출해주시면 신속한 처리에 도움이 됩니다.</li>
          </ul>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제6조 (배송비 부담 기준)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>제품 하자, 파손, 오배송 등 회사 귀책 사유의 경우 배송비는 메탈로라가 부담합니다.</li>
            <li>단순변심 반품 배송비는 구매자 부담이며, 정확한 금액은 반품 접수 시 안내드립니다.</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제7조 (반품 절차)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>반품 전 1:1 문의 또는 이메일로 접수해 주세요. 접수 후 반품 방법과 주소를 안내드립니다.</p>
        </div>
        <Divider />

        <div className="mt-12 mb-8">
          <h2 className="text-[20px] font-bold text-zinc-950 dark:text-white border-b-2 border-purple-500 pb-2 inline-block">배송 안내 (Metalora Shipping Policy)</h2>
        </div>

        <div className="space-y-4">
          <div className="bg-zinc-50 dark:bg-white/5 p-6 rounded-2xl border border-zinc-100 dark:border-white/5 shadow-sm">
            <h4 className="font-bold text-zinc-950 dark:text-white mb-2 flex items-center gap-2 text-[16px]">
              ■ 현재 무료배송
            </h4>
            <p className="text-[15px] text-zinc-700 dark:text-zinc-300 leading-relaxed font-normal">
              현재 무료배송입니다. 제주·도서산간을 포함한 고객 추가 배송비는 없습니다.
            </p>
          </div>

          <div className="bg-zinc-50 dark:bg-white/5 p-6 rounded-2xl border border-zinc-100 dark:border-white/5 shadow-sm">
            <h4 className="font-bold text-zinc-950 dark:text-white mb-2 flex items-center gap-2 text-[16px]">
              ■ 일반 상품 출고
            </h4>
            <p className="text-[15px] text-zinc-700 dark:text-zinc-300 leading-relaxed font-normal">
              일반 상품은 주문 후 <span className="font-semibold text-zinc-950 dark:text-white">2~3영업일 이내 출고</span>됩니다.
            </p>
          </div>

          <div className="bg-zinc-50 dark:bg-white/5 p-6 rounded-2xl border border-zinc-100 dark:border-white/5 shadow-sm">
            <h4 className="font-bold text-zinc-950 dark:text-white mb-2 flex items-center gap-2 text-[16px]">
              ■ WORKSHOP 출고
            </h4>
            <p className="text-[15px] text-zinc-700 dark:text-zinc-300 leading-relaxed font-normal">
              WORKSHOP은 이미지 승인 후 <span className="font-semibold text-zinc-950 dark:text-white">3~5영업일 이내 출고</span>됩니다.
            </p>
          </div>
        </div>

        <div className="text-[13px] opacity-70 text-zinc-500 mt-12">
          부칙<br />
          본 정책은 2026년 10월 6일부터 적용됩니다.
        </div>
      </div>
    )
  },
  privacy: {
    title: '개인정보 처리방침 (Metalora Legal v26.10.07)',
    content: (
      <div className="font-sans pb-8">
        <div className="bg-white dark:bg-zinc-900/40 p-6 rounded-2xl mb-10 border border-zinc-200 dark:border-white/5 shadow-sm">
          <p className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-200 font-semibold">
            메탈로라는 회원 가입, 주문·배송, WORKSHOP 제작, 고객 문의 처리에 <span className="text-purple-600 dark:text-purple-400">실제로 필요한 정보</span>만 처리합니다.<br/>
            WORKSHOP 주문에 사용된 원본 및 미리보기 이미지는 관리자가 주문 상태를 배송완료로 처리한 후 <span className="text-purple-600 dark:text-purple-400">3일이 지나면 순차 삭제</span>합니다.
          </p>
        </div>

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제1조 (개인정보 처리자)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>본 방침은 메탈로라가 운영하는 웹사이트에서 처리하는 개인정보에 적용됩니다.</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><span className="text-zinc-950 dark:text-white font-bold">상호:</span> 메탈로라(METALORA)</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">사업자 형태:</span> 개인사업자</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">대표자:</span> 강동훈</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">사업자등록번호:</span> 776-19-02470</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">통신판매업 신고:</span> 2026-울산울주-0166</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">사업장 소재지:</span> 울산광역시 울주군 서생면 진하해변길 8, 12층 1202호 라-04호실(아성 일마레)</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">이메일:</span> a84411448@gmail.com</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">전화:</span> 010-5595-0541</li>
          </ul>
          <p>본 방침에서 “회사”는 위 메탈로라를 말합니다. 사이트 1:1 문의도 현재 운영 중인 고객 연락 창구입니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제2조 (처리 항목과 이용 목적)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-4">
          <p>회사는 아래 목적 범위에서 개인정보를 처리합니다. 광고·마케팅을 위한 별도 활용은 하지 않습니다.</p>
          <ol className="list-decimal pl-5 space-y-4">
            <li>
              <span className="text-zinc-900 dark:text-white font-bold">회원 계정·인증</span>
              <p className="mt-2">로그인 이메일, 비밀번호 계정의 경우 서비스가 생성하는 아이디@metalora.me 형식의 인증용 이메일, 소셜 로그인 시 해당 제공자가 돌려주는 이메일·식별정보, 이름, 휴대전화번호, 전화번호 인증 관련 정보, 회원 아이디, 인증·제공자 식별값을 회원 가입·로그인·본인 확인·계정 유지에 사용합니다.</p>
            </li>
            <li>
              <span className="text-zinc-900 dark:text-white font-bold">주문·배송</span>
              <p className="mt-2">수령인 이름, 연락처, 주소, 우편번호, 주문·상품·옵션·수량·금액·상태 정보를 주문 접수, 제작, 배송, 거래 이행에 사용합니다. 현재 공개 결제 경로는 준비 중이며, 이 방침은 고객으로부터 살아있는 결제카드·결제키 정보를 지금 수집한다고 보지 않습니다.</p>
            </li>
            <li>
              <span className="text-zinc-900 dark:text-white font-bold">WORKSHOP 맞춤 제작</span>
              <p className="mt-2">이용자가 업로드한 원본 이미지, 생성된 미리보기·파생 이미지, WORKSHOP 설정값을 개별 제작·검수·재현에 사용합니다.</p>
            </li>
            <li>
              <span className="text-zinc-900 dark:text-white font-bold">고객 문의</span>
              <p className="mt-2">문의 제목·내용, 답변, 작성 시각, 관련 계정 정보를 상담·분쟁 처리에 사용합니다.</p>
            </li>
            <li>
              <span className="text-zinc-900 dark:text-white font-bold">약관·정책 동의 기록</span>
              <p className="mt-2">정책 종류, 정책 버전, 동의 시각, 동의 경로, 관련 주문번호를 동의·계약 이행 증빙에 사용합니다. 과거 일부 기록에 접속 IP가 남아 있을 수 있으나, 현재 새로 쌓는 동의 기록은 IP를 필수로 받지 않습니다.</p>
            </li>
            <li>
              <span className="text-zinc-900 dark:text-white font-bold">보안·운영</span>
              <p className="mt-2">접속 IP, User-Agent, 보안·인증 이벤트, 문자 인증 메타데이터, 요청 제한에 필요한 식별값을 부정이용·남용 방지와 서비스 안정 운영에 사용합니다.</p>
            </li>
            <li>
              <span className="text-zinc-900 dark:text-white font-bold">선택적 이용 분석</span>
              <p className="mt-2">사이트 쿠키 설정에서 분석 기능을 허용한 경우에만 Google Analytics로 이용 현황을 측정합니다. 이 선택은 회원 가입에 필요한 개인정보 처리방침 동의와 별개입니다. 분석을 거절해도 회원 가입과 기본 서비스 이용 자체가 막히지는 않습니다.</p>
            </li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제3조 (수집 방법)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>이용자가 회원 가입, 프로필, 주문, 문의, WORKSHOP 이용 과정에서 직접 입력하거나 업로드하는 정보</li>
            <li>이용자가 Google, 카카오, 네이버로 로그인을 허용한 뒤 해당 제공자가 회사에 돌려주는 계정 정보</li>
            <li>웹사이트·서버 이용 과정에서 자동으로 생성되는 기술·보안 정보</li>
            <li>주문·제작·고객 지원 과정에서 쌓이는 거래·상담 기록</li>
          </ol>
          <p>회사는 이용자가 허용하지 않은 외부 출처에서 개인정보를 수집하지 않습니다. 소셜 로그인 시 회사가 이용자의 전체 프로필을 각 제공자에게 보내는 방식은 아닙니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제4조 (보유 기간)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <p>아래 기간은 법령상 보관이 필요한 기간입니다. 기간이 끝났다고 해서 지금 시스템이 주문·결제·문의 기록을 자동으로 지우는 것은 아닙니다.</p>
          <ol className="list-decimal pl-5 space-y-3">
            <li>계약 또는 청약철회 등에 관한 기록: 5년</li>
            <li>대금결제 및 재화 등의 공급에 관한 기록: 5년</li>
            <li>소비자 불만 또는 분쟁처리에 관한 기록: 3년</li>
            <li>표시·광고에 관한 기록: 해당 기록이 실제로 있는 경우에 한해 6개월</li>
          </ol>
          <p>회원 계정·프로필 중 법령 보관 대상이 아닌 정보는 탈퇴 처리 시 삭제하거나 알아볼 수 없도록 바꿉니다. 거래·분쟁·동의 증빙처럼 보관이 필요한 기록은 해당 목적과 기간 동안 따로 남습니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제5조 (WORKSHOP 이미지 보관)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>WORKSHOP 주문에 사용된 원본 및 미리보기 이미지는 관리자가 주문 상태를 배송완료로 처리한 후 3일이 지나면 순차 삭제합니다.</p>
          <p>주문으로 이어지지 않은 WORKSHOP 업로드 이미지는 마지막 관련 활동 후 3일이 지나면 순차 삭제합니다. 진행 중인 주문, 장바구니, 제작 과정에 묶여 있는 이미지는 그 보호 대상에서 빼지 않습니다.</p>
          <p>이미 결제가 되었거나 제작·배송이 진행 중인 WORKSHOP 주문은, 회원이 탈퇴하더라도 주문을 마치기 위해 필요한 동안 이미지가 남을 수 있습니다. 이후 관리자가 배송완료로 처리하고 3일이 지나면 제1항에 따라 삭제됩니다.</p>
          <p>이미지가 삭제된 뒤에는 같은 그림으로 다시 만들거나 재인쇄하려면 이미지를 다시 올려 주셔야 합니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제6조 (회원 탈퇴)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>현재 회원 탈퇴는 사이트 메뉴에서 바로 누르는 방식이 아닙니다. 사이트 1:1 문의 또는 a84411448@gmail.com으로 요청하시면, 요청 내용을 확인한 뒤 처리합니다.</p>
          <p>탈퇴가 처리되면 해당 회원 계정은 사용할 수 없게 되고, 법령 보관에 필요 없는 계정·프로필 정보는 삭제되거나 알아볼 수 없도록 바뀝니다. 거래·분쟁·동의 증빙처럼 보관이 필요한 기록은 해당 기간 동안 남습니다.</p>
          <p>탈퇴 후에도 진행 중인 주문을 마치기 위해 필요한 배송·제작 정보는 주문 이행이 끝날 때까지 유지될 수 있습니다. 이미 남긴 약관·정책 동의 기록은 나중에 이용자가 고치거나 지울 수 있는 대상이 아닙니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제7조 (파기 방법)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>전자적 계정·프로필 정보: 데이터베이스에서 삭제하거나 알아볼 수 없도록 처리합니다.</li>
            <li>WORKSHOP 이미지: 저장소에서 해당 파일을 삭제합니다.</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제8조 (처리위탁)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>회사는 서비스 운영을 위해 아래와 같이 처리를 맡깁니다. 고객 개인정보를 제3자에게 판매하지 않습니다.</p>
          <ul className="list-disc pl-5 space-y-3">
            <li>
              <span className="text-zinc-950 dark:text-white font-bold">Supabase:</span> 회원 인증, 데이터베이스 보관, WORKSHOP 이미지 저장. 계정·주문·문의·동의 기록과 업로드 이미지가 이 목적 범위에서 처리됩니다. 보관 위치는 대한민국(서울)입니다.
            </li>
            <li>
              <span className="text-zinc-950 dark:text-white font-bold">Google Cloud (Cloud Run):</span> 웹사이트·서버 요청 처리. 요청에 계정·주문·문의·인증 정보가 포함되면 그 요청 처리 과정에서 함께 다뤄질 수 있습니다. 주문·계정 원장은 Cloud Run에 따로 쌓아 두지 않습니다.
            </li>
            <li>
              <span className="text-zinc-950 dark:text-white font-bold">SOLAPI:</span> 휴대전화 문자 인증. 수신 번호와 인증 문자 발송에 필요한 정보만 전달합니다. 프로필·주문 전체를 보내지 않습니다.
            </li>
            <li>
              <span className="text-zinc-950 dark:text-white font-bold">Discord:</span> 회사 내부 운영 알림. 결제가 승인되거나 결제 처리 중 오류가 생기면 주문 처리에 필요한 제한된 주문 정보가 회사 내부 알림 채널로 전송됩니다. 이름, 전화번호, 주소, 이메일, WORKSHOP 이미지, 문의 내용은 보내지 않습니다. 광고, 프로파일링, 고객 대상 메시지 발송에는 쓰지 않습니다.
            </li>
          </ul>
          <p>택배사 시스템에 배송 정보를 자동으로 넘기는 연동은 현재 없습니다. 관리자가 운송장 내용을 기록하는 것과, 택배사를 개인정보 처리 수탁자로 두는 것은 다릅니다.</p>
          <p>공개 결제가 시작되면 결제 처리를 위해 토스페이먼츠가 사용될 수 있습니다. 지금은 공개 결제 경로가 멈춰 있어, 고객 결제정보를 토스페이먼츠가 받아 처리하는 상태로 보지 않습니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제9조 (국외 이전·처리)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>회사는 이용자와의 계약을 체결하고 이행하는 데 필요한 처리위탁·보관을 위해, 「개인정보 보호법」 제28조의8 제1항 제3호에 따라 아래 사항을 이 처리방침에 공개하고 개인정보를 국외로 이전합니다. 이 이전은 별도 동의를 받는 방식이 아닙니다.</p>

          <p className="text-zinc-950 dark:text-white font-bold">1. Google Cloud (웹사이트·서버 운영)</p>
          <ul className="list-disc pl-5 space-y-3">
            <li><span className="text-zinc-950 dark:text-white font-bold">이전받는 자:</span> Google Cloud 서비스를 제공하는 Google 법인. Google Cloud 공식 안내상 대한민국 결제 주소 고객의 계약 주체는 Google Cloud Korea LLC(서울특별시 강남구 테헤란로 152 강남파이낸스센터 20층)입니다.</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">연락처:</span> Google Cloud 데이터 보호팀 (https://support.google.com/cloud/contact/dpo)</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">이전 국가:</span> 미국 (오리건, Google Cloud Run us-west1 리전)</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">이전 항목:</span> 이용자가 보낸 요청에 포함된 계정·인증, 주문·배송, 문의, 보안 관련 정보와 그 처리 과정에서 생기는 서버 운영 기록</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">이용 목적:</span> 회사 웹사이트 제공과 API 요청 처리 등 서비스 인프라 운영</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">이전 시기·방법:</span> 이용자가 웹사이트를 이용할 때마다 암호화된 통신(HTTPS)으로 전송</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">보유·이용 기간:</span> 요청을 처리하는 동안 처리하며, 서버 운영 기록은 회사의 Google Cloud 로그 보관 설정에 따른 기간 동안 보관됩니다. 계정·주문 원장은 이 인프라에 따로 저장하지 않으며, 대한민국(서울)에 있는 Supabase에 보관됩니다(제8조).</li>
          </ul>

          <p className="text-zinc-950 dark:text-white font-bold">2. Discord (내부 주문·결제 운영 알림)</p>
          <ul className="list-disc pl-5 space-y-3">
            <li><span className="text-zinc-950 dark:text-white font-bold">이전받는 자:</span> Discord Inc.</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">연락처:</span> privacy@discord.com / 444 De Haro Street #200, San Francisco, CA 94107, USA</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">이전 국가:</span> 미국. Discord는 공식 개인정보처리방침에서 미국 서버에서 정보를 처리·저장하며, 이용자와 서비스 제공자의 위치에 따라 다른 국가의 서버에도 저장할 수 있다고 밝히고 있습니다.</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">이전 항목:</span> 결제 승인 알림의 경우 주문번호, 결제 금액, 결제수단, 상품명·옵션·수량, 맞춤 제작 여부와 선택한 제작 옵션. 결제 오류 알림의 경우 요청·주문 식별자, 처리 단계, 응답 코드. 이름, 전화번호, 주소, 이메일, WORKSHOP 이미지, 문의 내용은 포함하지 않습니다.</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">이용 목적:</span> 회사 내부의 주문 확인과 결제 장애 대응</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">이전 시기·방법:</span> 결제가 승인되거나 결제 처리 오류가 생길 때 암호화된 통신(HTTPS)으로 회사 내부 알림 채널에 전송. 현재 공개 결제는 준비 중이어서, 공개 결제가 시작되기 전에는 주문 승인 알림이 생기지 않습니다.</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">보유·이용 기간:</span> 회사가 해당 알림을 삭제하거나 위탁 관계가 끝날 때까지. Discord 측 처리는 Discord의 개인정보처리방침에 따릅니다.</li>
          </ul>

          <p className="text-zinc-950 dark:text-white font-bold">국외 이전을 거부하는 방법과 효과</p>
          <p>위 국외 이전을 원하지 않으시면 사이트 1:1 문의 또는 a84411448@gmail.com으로 회원 탈퇴나 이용 중단을 요청하실 수 있습니다. 위 서비스는 웹사이트, 회원, 주문 처리에 꼭 필요한 기반이어서 특정 이용자만 따로 제외하는 기능은 없습니다. 따라서 거부하시면 회원 서비스와 주문을 제공할 수 없습니다.</p>
          <p>이와 달리 선택적 분석(Google Analytics)은 사이트의 쿠키 설정에서 거절할 수 있고, 거절해도 회원 가입과 기본 서비스 이용에는 영향이 없습니다.</p>
          <p>이용자가 분석 기능을 허용한 경우에 한해 이용 정보가 Google Analytics로 전송될 수 있습니다. Google의 처리 위치는 Google이 공개하는 정책에 따르며, 확인되지 않은 국가 목록을 이 방침에서 단정하지 않습니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제10조 (외부 인증 및 제3자 제공)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>회사는 원칙적으로 개인정보를 제3자에게 제공하지 않습니다. 법령에 따른 요청이 있는 경우는 예외입니다.</p>
          <p>Google, 카카오, 네이버 로그인은 이용자가 해당 사업자에게 직접 인증을 허용한 뒤, 회사가 그 결과로 계정 식별에 필요한 정보를 받는 과정입니다. 이는 회사가 고객 정보를 해당 사업자에게 넘기는 제3자 제공과 다릅니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제11조 (쿠키 및 선택적 분석)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>로그인 유지, 화면 설정, 보안처럼 서비스에 필요한 브라우저·기기 저장값은 서비스 제공을 위해 사용될 수 있습니다. 자세한 내용은 쿠키 정책을 따릅니다.</p>
          <p>선택적 분석(Google Analytics)은 사이트의 쿠키 설정에서 따로 허용한 경우에만 켜집니다. 회원 가입 시 확인하는 개인정보 처리방침 동의는 분석 동의가 아닙니다.</p>
          <p>분석 기능을 허용한 경우 방문 페이지, 상품 조회, 장바구니 이용, 브라우저·기기 정보, 대략적인 지역, 분석 식별자가 처리될 수 있습니다. 공개 결제가 시작되면 같은 분석 경로에 결제·구매 측정이 포함될 수 있습니다.</p>
          <p>
            Google이 정보를 사용하는 방식은{' '}
            <a
              href="https://policies.google.com/technologies/partner-sites?hl=ko"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 dark:text-purple-400 underline underline-offset-2"
            >
              Google이 서비스를 사용하는 사이트 또는 앱의 정보를 사용하는 방식
            </a>
            에서 확인할 수 있습니다.
          </p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제12조 (이용자의 권리)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>이용자는 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지, 회원 탈퇴를 요청할 수 있습니다. 현재는 사이트 1:1 문의 또는 a84411448@gmail.com으로 요청해 주시면, 본인 확인 후 처리합니다.</p>
          <p>법령상 보관이 필요한 거래·분쟁·동의 기록은 요청만으로 바로 지우지 못할 수 있습니다. 법정 기한 밖의 임의 처리 기한은 약속하지 않습니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제13조 (개인정보 보호책임자)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>개인정보 처리에 관한 업무와 고충 처리를 위해 아래와 같이 개인정보 보호책임자를 둡니다. 별도의 전담 부서는 두지 않습니다.</p>
          <ul className="list-disc pl-5 space-y-3">
            <li><span className="text-zinc-950 dark:text-white font-bold">성명:</span> 강동훈</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">직책:</span> 대표자 / 개인정보 보호책임자</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">이메일:</span> a84411448@gmail.com</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">전화:</span> 010-5595-0541</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">기타:</span> 사이트 1:1 문의</li>
          </ul>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제14조 (안전성 확보조치)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>회사는 개인정보 보호를 위해 접근 권한 제한, 전송 구간 암호화, 인증·보안 이벤트 기록, 내부 관리를 시행합니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제15조 (개인정보 유출 대응)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>개인정보 유출이 발생한 경우 회사는 관련 법령에 따라 이용자에게 알리고 필요한 조치를 합니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제16조 (권익침해 구제)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>개인정보 침해에 대한 상담이나 신고는 아래 기관에도 문의할 수 있습니다.</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)</li>
            <li>개인정보침해신고센터: 118 (privacy.kisa.or.kr)</li>
            <li>대검찰청: 1301 (www.spo.go.kr)</li>
            <li>경찰청: 182 (ecrm.police.go.kr)</li>
          </ul>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제17조 (개인정보 처리방침 변경)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>회사는 처리 내용이 바뀌면 본 방침을 개정하고, 변경 사항을 사이트에 알립니다. 예전 버전에 대한 동의 기록은 그때 실제로 동의하신 내용의 증빙으로 남습니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">부칙</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>본 방침은 2026년 10월 7일부터 시행합니다.</p>
        </div>
      </div>
    )
  },
  cookie: {
    title: '쿠키 정책 (Metalora Cookie Policy v26.10.07)',
    content: (
      <div className="font-sans pb-8">
        <div className="bg-white dark:bg-zinc-900/40 p-6 rounded-2xl mb-10 border border-zinc-200 dark:border-white/5 shadow-sm">
          <p className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-200 font-semibold">
            서비스 제공에 필요한 브라우저·기기 저장값과, <span className="text-purple-600 dark:text-purple-400">따로 허용한 경우에만</span> 켜지는 선택적 분석을 구분해 안내합니다.<br/>
            분석 기능을 거절해도 회원 가입과 기본 서비스 이용 자체가 막히지는 않습니다.
          </p>
        </div>

        <p className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-300 font-normal mb-8">
          메탈로라(이하 “회사”)는 로그인 유지, 화면 설정, 보안처럼 서비스 운영에 필요한 저장값과, 이용 현황 파악을 위한 선택적 분석 저장값을 구분해 사용합니다. 본 정책은 그 내용과 선택 방법을 설명합니다.
        </p>

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제1조 (쿠키와 로컬 저장값)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>쿠키는 이용자가 웹사이트를 방문할 때 기기에 저장되는 소량의 데이터입니다. 이와 별도로 브라우저는 로그인 상태, 화면 테마, 언어, 분석 선택값처럼 서비스에 필요한 값을 기기에 저장할 수 있습니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제2조 (사용 목적)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div className="bg-white dark:bg-zinc-900/40 p-6 rounded-2xl flex items-start gap-4 border border-zinc-200 dark:border-white/5 shadow-sm">
            <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-zinc-900 dark:text-white border border-zinc-100 dark:border-white/5 flex-shrink-0"><Settings size={20} /></div>
            <div>
              <h4 className="text-zinc-900 dark:text-white font-bold mb-1">서비스 편의 제공</h4>
              <p className="text-[14px] text-zinc-900 dark:text-zinc-400 leading-relaxed font-medium">로그인 상태 유지 및 화면·언어 설정을 기억하여 편리한 이용을 돕습니다.</p>
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-900/40 p-6 rounded-2xl flex items-start gap-4 border border-zinc-200 dark:border-white/5 shadow-sm">
            <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-zinc-900 dark:text-white border border-zinc-100 dark:border-white/5 flex-shrink-0"><ShieldCheck size={20} /></div>
            <div>
              <h4 className="text-zinc-900 dark:text-white font-bold mb-1">보안 및 안정성</h4>
              <p className="text-[14px] text-zinc-900 dark:text-zinc-400 leading-relaxed font-medium">비정상적인 접속 시도를 탐지하고 세션을 안전하게 유지합니다.</p>
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-900/40 p-6 rounded-2xl flex items-start gap-4 border border-zinc-200 dark:border-white/5 shadow-sm">
            <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-zinc-900 dark:text-white border border-zinc-100 dark:border-white/5 flex-shrink-0"><BarChart3 size={20} /></div>
            <div>
              <h4 className="text-zinc-900 dark:text-white font-bold mb-1">선택적 이용 분석</h4>
              <p className="text-[14px] text-zinc-900 dark:text-zinc-400 leading-relaxed font-medium">분석 기능을 허용한 경우에만 사이트 이용을 측정하고 서비스를 개선합니다.</p>
            </div>
          </div>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제3조 (저장값의 종류)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-4">
            <li>
              <span className="font-bold text-zinc-900 dark:text-white">필수 저장값</span><br/>
              로그인, 보안, 장바구니·제작 진행처럼 서비스를 제공하는 데 필요한 브라우저·기기 저장값입니다.
            </li>
            <li>
              <span className="font-bold text-zinc-900 dark:text-white">기능 저장값</span><br/>
              화면 테마, 언어처럼 이용자 설정을 기억하는 값입니다.
            </li>
            <li>
              <span className="font-bold text-zinc-900 dark:text-white">선택적 분석</span><br/>
              사이트의 쿠키 설정에서 분석을 허용한 경우에만 Google Analytics가 켜집니다. 이 선택은 회원 가입에 필요한 약관·개인정보 처리방침 동의와 별개입니다.
            </li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제4조 (분석 선택)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>이용자는 처음 방문 시 분석 기능을 허용하거나 필수만 허용할 수 있습니다. 이 선택은 기기의 로컬 저장값으로 기억됩니다.</li>
            <li>필수만 허용을 선택한 경우 Google Analytics는 작동하지 않으며, 회원 가입과 필수 서비스 기능은 계속 이용할 수 있습니다.</li>
            <li>이후에는 사이트의 쿠키 설정에서 분석 기능 허용 여부를 변경할 수 있습니다.</li>
            <li>이와 별도로 웹 브라우저 설정에서 쿠키를 차단하거나 삭제할 수 있습니다. 브라우저에서 쿠키를 차단하면 로그인 유지 등 일부 기능에 영향을 줄 수 있습니다.</li>
          </ol>
          <div className="mt-6 p-6 bg-white dark:bg-zinc-900/40 rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm">
            <p className="font-bold text-zinc-950 dark:text-zinc-200 mb-3">※ 브라우저별 설정 방법 (예시)</p>
            <ul className="list-disc pl-5 space-y-2 text-sm text-zinc-950 dark:text-zinc-300">
              <li><span className="text-zinc-950 dark:text-white font-medium">Chrome:</span> 설정 &gt; 개인정보 및 보안 &gt; 쿠키 및 기타 사이트 데이터</li>
              <li><span className="text-zinc-950 dark:text-white font-medium">Safari:</span> 환경설정 &gt; 개인정보 보호 &gt; 쿠키 및 웹 사이트 데이터</li>
              <li><span className="text-zinc-950 dark:text-white font-medium">Edge:</span> 설정 &gt; 쿠키 및 사이트 권한</li>
            </ul>
          </div>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제5조 (Google Analytics 분석 쿠키)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <p>분석 기능을 허용한 경우, 자사 도메인에 설정되는 Google Analytics 분석 쿠키가 사용될 수 있습니다.</p>
          <p>현재 사용되는 분석 쿠키는 다음과 같습니다.</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><span className="text-zinc-900 dark:text-white font-medium">_ga</span>: 이용자와 세션을 구분하기 위한 분석 식별자</li>
            <li><span className="text-zinc-900 dark:text-white font-medium">_ga_T2FFXETHTZ</span>: 사이트 이용 및 참여도를 측정하기 위한 분석 쿠키</li>
          </ul>
          <p>분석 쿠키의 보관 기간은 Google 정책 및 이용 브라우저 정책에 따라 별도로 적용되며, Google Analytics 계정에 설정된 이벤트·사용자 데이터 보관 기간과는 다릅니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제6조 (쿠키 정책의 변경)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <p>회사는 관련 법령 및 서비스 변경에 따라 본 쿠키 정책을 변경할 수 있으며, 변경 시 사이트에 알립니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">부칙</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <p>본 정책은 2026년 10월 7일부터 시행합니다.</p>
        </div>
      </div>
    )
  },
  agreement: {
    title: 'WORKSHOP 제작 및 콘텐츠 이용 동의서 (Metalora Consent v26.10.06)',
    content: (
      <div className="font-sans pb-8">
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-400 p-6 rounded-2xl font-semibold mb-10 leading-relaxed">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={20} className="text-red-600 dark:text-red-500" />
            <span className="text-red-700 dark:text-red-500 font-bold text-[16px]">저작권 및 초상권 책임 안내</span>
          </div>
          본 동의서는 <span className="text-red-800 dark:text-red-300 font-bold">WORKSHOP 맞춤 제작</span>에 적용됩니다. 타인의 저작권, 초상권, 퍼블리시티권을 침해하는 콘텐츠(유명인 사진, 애니메이션 캐릭터, 타인의 창작물 등)를 무단으로 사용하여 발생하는 <span className="text-red-800 dark:text-red-300 font-bold">모든 민·형사상 법적 책임은 전적으로 주문자(이용자) 본인에게 귀속</span>됩니다.
        </div>

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제1조 [서비스의 성격]</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>본 동의서는 이용자가 이미지를 업로드하여 개별 제작을 의뢰하는 WORKSHOP에 적용됩니다. 일반 카탈로그 상품에는 적용되지 않습니다.</p>
          <ol className="list-decimal pl-5 space-y-3">
            <li>WORKSHOP은 이용자가 제공한 이미지를 바탕으로 개별 제작됩니다.</li>
            <li>업로드된 이미지는 자동 승인되지 않으며, 회사의 검수 후 제작이 승인됩니다.</li>
            <li>검수는 제작 가능 여부 확인을 위한 것이며, 저작권·초상권의 최종 책임은 이용자에게 있습니다.</li>
            <li>회사는 관련 법령 준수 및 서비스 운영을 위해 필요한 경우 콘텐츠를 제한, 거부 또는 삭제할 수 있습니다.</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제1조의2 [취소·청약철회 및 하자]</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>이미지 업로드나 결제 완료만으로 제작이 시작된 것으로 보지 않습니다. 제작은 이미지 검수 후 제작 승인이 이루어진 때부터 진행됩니다.</li>
            <li>이미지 검수 및 제작 승인 전에는 취소할 수 있습니다.</li>
            <li>제작 승인 이후에는 사전 안내 및 동의한 범위에서 단순변심에 의한 청약철회가 제한될 수 있습니다.</li>
            <li>상품의 불량, 파손, 오배송에 대한 교환·환불 권리는 유지됩니다.</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제2조 [이용자의 권리 보유 및 책임]</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>이용자는 업로드 및 생성하는 모든 콘텐츠(이미지, 인물, 캐릭터 등)에 대해 다음 사항을 명시적으로 보증합니다.</p>
          <ol className="list-decimal pl-5 space-y-3">
            <li>본인이 직접 창작하였거나, 원저작자로부터 상업적/개인적 이용 허락을 적법하게 득한 이미지입니다.</li>
            <li>이미지에 포함된 인물의 초상권을 침해하지 않으며, 필요한 경우 당사자의 동의를 받았습니다.</li>
            <li>음란물, 폭력물 등 관련 법령에 위배되는 불법적인 요소가 포함되어 있지 않습니다.</li>
          </ol>
          <p>이용자가 이를 위반하여 발생하는 모든 민형사상 책임은 전적으로 이용자에게 귀속됩니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제3조 [콘텐츠 이용 범위]</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>이용자가 제공한 이미지는 <span className="text-zinc-950 dark:text-white font-medium">오직 해당 주문의 상품 제작 및 배송 목적</span>으로만 사용됩니다.</li>
            <li>회사는 이용자의 동의 없이 해당 이미지를 마케팅, 포트폴리오 등 다른 목적으로 절대 사용하지 않습니다.</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제4조 [콘텐츠 제한 및 이용 거부]</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>회사는 다음에 해당하는 경우 사전 통지 없이 주문을 거부 또는 취소할 수 있습니다.</p>
          <ol className="list-decimal pl-5 space-y-3">
            <li>저작권, 초상권 등 권리 침해가 우려되는 경우</li>
            <li>음란물, 불법 콘텐츠 등 법령 위반 가능성이 있는 경우</li>
            <li>기타 회사의 정책 또는 기술적 기준에 부합하지 않는 경우</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제5조 [이미지 처리]</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>이용자가 업로드한 이미지는 WORKSHOP 제작 및 배송 이행을 위해 처리됩니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제6조 [면책 및 손해배상]</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>이용자의 콘텐츠로 인해 발생하는 저작권, 초상권, 개인정보 침해 등 모든 법적 책임은 이용자에게 있습니다.</li>
            <li>이용자의 위반 행위로 인해 회사가 제3자로부터 손해배상 청구, 소송, 형사 고발 등을 당할 경우, 이용자는 회사에 발생한 모든 손해를 배상하여야 합니다.</li>
            <li>본 조에 따른 손해에는 변호사 비용, 합의금, 배상금, 기타 법적 대응에 소요된 비용이 포함됩니다.</li>
            <li>회사는 이용자가 제공한 콘텐츠의 적법성에 대해 보증하지 않으며, 이에 따른 분쟁에 대해 책임을 부담하지 않습니다.</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제7조 [책임의 한계]</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>회사는 다음 사유로 인한 손해에 대해 책임을 지지 않습니다.</p>
          <ol className="list-decimal pl-5 space-y-3">
            <li>이용자의 귀책사유로 인한 문제</li>
            <li>이용자가 제공한 콘텐츠 자체의 문제</li>
            <li>불가항력(천재지변, 시스템 장애 등)에 의한 서비스 중단</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제8조 [동의의 기록 및 효력]</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>이용자는 본 동의서 내용을 확인하고 동의하며, 회사는 동의 사실(동의 시각, 버전 정보 등)을 기록 및 보관할 수 있습니다.<br/>해당 기록은 분쟁 발생 시 법적 증거로 활용됩니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">부칙</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>본 동의서는 2026년 10월 6일부터 시행됩니다.</p>
        </div>
      </div>
    )
  }
};
