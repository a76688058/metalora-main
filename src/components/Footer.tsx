import React, { useState, useEffect } from 'react';
import PolicyModal from './PolicyModal';
import { ShieldCheck, AlertCircle, Settings, BarChart3 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const Divider = () => <div className="h-[1px] bg-current opacity-10 my-8" />;

export const policies = {
  terms: {
    title: '이용약관 (Metalora Terms v26.03.26)',
    content: (
      <div className="font-sans pb-8">
        <div className="bg-white dark:bg-zinc-900/40 p-6 rounded-2xl mb-10 border border-zinc-200 dark:border-white/5 shadow-sm">
          <p className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-200 font-semibold">
            메탈로라 서비스는 <span className="text-purple-600 dark:text-purple-400">1:1 맞춤형 주문제작</span> 방식으로 운영됩니다.<br/>
            결제 완료 후 제작이 시작되면 <span className="text-purple-600 dark:text-purple-400">단순 변심으로 인한 취소 및 환불이 불가</span>하오니 신중한 주문 부탁드립니다.
          </p>
        </div>

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제1조 (목적)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>본 약관은 주식회사 메탈로라(이하 "회사")가 제공하는 이미지 기반 주문 제작 서비스(이하 "서비스")의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제2조 (정의)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ul className="list-disc pl-5 space-y-3">
            <li><span className="font-medium text-zinc-950 dark:text-white">"이용자"</span>란 본 약관에 따라 회사가 제공하는 서비스를 이용하는 자를 말합니다.</li>
            <li><span className="font-medium text-zinc-950 dark:text-white">"서비스"</span>란 이용자가 업로드한 이미지 및 데이터를 기반으로 상품을 제작 및 배송하는 일체의 서비스를 의미합니다.</li>
            <li><span className="font-medium text-zinc-950 dark:text-white">"콘텐츠"</span>란 이용자가 서비스 이용 과정에서 업로드하거나 생성한 이미지, 텍스트 등 모든 자료를 의미합니다.</li>
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
            <li>회사는 이용자가 업로드한 이미지를 기반으로 금속, 아크릴 등 다양한 소재의 커스텀 상품을 제작하여 제공합니다.</li>
            <li>회사는 기술적 사양 변경, 운영상 필요 등에 따라 서비스 내용을 변경할 수 있습니다.</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제5조 (계약의 성립)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>이용자가 주문 내용을 확인하고 결제를 완료한 시점에 계약이 성립합니다. 회사는 다음의 경우 주문을 거절하거나 취소할 수 있습니다.</p>
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
          <p>이용자는 다음 행위를 하여서는 안 됩니다.</p>
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
            <li>이용자가 업로드한 콘텐츠에 대한 저작권 및 기타 권리는 이용자에게 귀속됩니다.</li>
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
          <p>본 약관은 2026년 3월 26일부터 시행됩니다.</p>
        </div>
      </div>
    )
  },
  privacy: {
    title: '개인정보 처리방침 (Metalora Legal v26.03.26)',
    content: (
      <div className="font-sans pb-8">
        <div className="bg-white dark:bg-zinc-900/40 p-6 rounded-2xl mb-10 border border-zinc-200 dark:border-white/5 shadow-sm">
          <p className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-200 font-semibold">
            메탈로라는 서비스 제공을 위해 <span className="text-purple-600 dark:text-purple-400">꼭 필요한 최소한의 정보</span>만 수집합니다.<br/>
            업로드하신 이미지 데이터는 제작 완료 후 <span className="text-purple-600 dark:text-purple-400">최대 7일 이내에 안전하게 영구 파기</span>됩니다.
          </p>
        </div>

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제1조 (개인정보의 수집 및 이용 목적)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-4">
          <p>회사는 다음의 목적을 위해 개인정보를 수집 및 이용합니다.</p>
          <div className="bg-white dark:bg-zinc-900/30 rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden mt-4">
            <div className="grid grid-cols-3 border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-white/5 p-3 text-zinc-900 dark:text-white font-bold text-sm">
              <div>수집 목적</div>
              <div>수집 항목</div>
              <div>보유 기간</div>
            </div>
            <div className="grid grid-cols-3 border-b border-zinc-200 dark:border-white/5 p-3 text-sm text-zinc-950 dark:text-zinc-300">
              <div className="text-zinc-950 dark:text-white font-medium">서비스 제공 및 계약 이행 (주문, 결제, 배송)</div>
              <div>성명, 휴대전화번호, 배송지 주소</div>
              <div className="text-purple-600 dark:text-purple-400 font-bold">5년 (전자상거래법)</div>
            </div>
            <div className="grid grid-cols-3 border-b border-zinc-200 dark:border-white/5 p-3 text-sm text-zinc-950 dark:text-zinc-300">
              <div className="text-zinc-950 dark:text-white font-medium">상품 맞춤 제작</div>
              <div>업로드 이미지, 편집 데이터</div>
              <div className="text-purple-600 dark:text-purple-400 font-bold">제작 완료 후 7일 이내 파기</div>
            </div>
            <div className="grid grid-cols-3 p-3 text-sm text-zinc-950 dark:text-zinc-300">
              <div className="text-zinc-950 dark:text-white font-medium">부정 이용 방지 및 서비스 개선</div>
              <div>IP 주소, 쿠키, 접속 로그, 기기 정보</div>
              <div>3개월 이상 (통신비밀보호법)</div>
            </div>
          </div>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제2조 (수집하는 개인정보 항목)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <p>회사는 다음의 개인정보를 수집합니다.</p>
          <ol className="list-decimal pl-5 space-y-3">
            <li><span className="text-zinc-900 dark:text-white font-bold">필수 항목:</span> 성명, 휴대전화번호, 배송지 주소</li>
            <li><span className="text-zinc-900 dark:text-white font-bold">주문 관련 정보:</span> 이용자가 업로드한 이미지 및 편집 데이터</li>
            <li><span className="text-zinc-900 dark:text-white font-bold">자동 수집 항목:</span> IP 주소, 쿠키, 접속 로그, 이용 기록, 기기 정보</li>
          </ol>
          <p>이용자는 타인의 권리를 침해하거나 개인정보가 포함된 콘텐츠를 업로드할 경우 이에 대한 모든 책임이 본인에게 있음을 확인합니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제3조 (개인정보의 보유 및 이용 기간)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <p>회사는 개인정보 수집 및 이용 목적 달성 시 지체 없이 파기합니다. 다만, 다음의 경우에는 해당 기간 동안 보관합니다.</p>
          <ol className="list-decimal pl-5 space-y-3">
            <li>
              <span className="text-zinc-950 dark:text-white font-bold">이미지 데이터</span>
              <ul className="list-disc pl-5 mt-2 text-zinc-800 dark:text-zinc-300 space-y-2">
                <li>주문 제작 완료 및 출고 후 <span className="text-purple-600 dark:text-purple-400 font-bold">최대 7일 이내 삭제</span></li>
              </ul>
            </li>
            <li>
              <span className="text-zinc-950 dark:text-white font-bold">법령에 따른 보관</span>
              <ul className="list-disc pl-5 mt-2 text-zinc-800 dark:text-zinc-300 space-y-2">
                <li>계약 또는 청약철회: 5년</li>
                <li>대금결제 및 재화 공급: 5년</li>
                <li>소비자 분쟁 처리: 3년</li>
                <li>표시/광고 기록: 6개월</li>
                <li>접속 로그: 3개월 이상</li>
              </ul>
            </li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제4조 (개인정보의 파기 방법)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li><span className="text-zinc-950 dark:text-white font-bold">전자적 파일:</span> 복구 불가능한 방법으로 영구 삭제</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">출력물:</span> 분쇄 또는 소각</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제5조 (개인정보 처리의 위탁)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>회사는 서비스 제공을 위해 다음과 같이 업무를 위탁합니다.</p>
          <ul className="list-disc pl-5 space-y-3">
            <li><span className="text-zinc-950 dark:text-white font-bold">Supabase:</span> 데이터 저장 및 클라우드 인프라</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">토스페이먼츠:</span> 결제 처리</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">CJ대한통운 / 우체국:</span> 배송</li>
          </ul>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제6조 (개인정보의 국외 이전)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>회사는 서비스 제공을 위해 개인정보를 국외로 이전할 수 있습니다.</p>
          <ul className="list-disc pl-5 space-y-3">
            <li><span className="text-zinc-950 dark:text-white font-bold">이전 대상:</span> Supabase</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">이전 국가:</span> 미국 등 서버 위치 국가</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">이전 항목:</span> 이름, 연락처, 주소, 주문 데이터</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">이전 목적:</span> 데이터 저장 및 서비스 운영</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">보유 기간:</span> 회원 탈퇴 또는 위탁 계약 종료 시까지</li>
          </ul>
          <p>이용자는 국외 이전을 거부할 수 있으며, 이 경우 서비스 이용이 제한될 수 있습니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제7조 (이용자의 권리 및 행사 방법)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>이용자는 언제든지 자신의 개인정보를 조회, 수정, 삭제 또는 처리정지를 요청할 수 있습니다. 회사는 지체 없이 이를 처리합니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제8조 (쿠키 및 자동 수집 장치)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>회사는 서비스 제공 및 이용 편의 향상을 위해 쿠키를 사용할 수 있습니다. 이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으며, 이 경우 일부 서비스 이용이 제한될 수 있습니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제9조 (개인정보 보호 조치)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>회사는 개인정보 보호를 위해 다음과 같은 조치를 시행합니다.</p>
          <ol className="list-decimal pl-5 space-y-3">
            <li>암호화 저장 및 전송</li>
            <li>접근 권한 최소화</li>
            <li>보안 시스템 운영</li>
            <li>내부 관리 및 교육</li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제10조 (개인정보 유출 대응)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>개인정보 유출이 발생한 경우 회사는 지체 없이 이용자에게 통지하고 관련 법령에 따라 조치합니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제11조 (개인정보 보호책임자)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ul className="list-disc pl-5 space-y-3">
            <li><span className="text-zinc-950 dark:text-white font-bold">성명:</span> 강동훈</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">직책:</span> 대표이사 / 개인정보 보호책임자</li>
            <li><span className="text-zinc-950 dark:text-white font-bold">연락처:</span> a76688058@gmail.com</li>
          </ul>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제12조 (개인정보 처리방침 변경)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>회사는 본 방침을 변경할 수 있으며, 변경 시 사전 공지합니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">부칙</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>본 방침은 2026년 3월 26일부터 시행됩니다.</p>
        </div>
      </div>
    )
  },
  cookie: {
    title: '쿠키 정책 (Metalora Cookie Policy v26.03.26)',
    content: (
      <div className="font-sans pb-8">
        <div className="bg-white dark:bg-zinc-900/40 p-6 rounded-2xl mb-10 border border-zinc-200 dark:border-white/5 shadow-sm">
          <p className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-200 font-semibold">
            더 나은 서비스 경험과 안정적인 접속을 위해 쿠키(Cookie)를 사용합니다.<br/>
            필수적인 기능 외의 쿠키는 <span className="text-purple-600 dark:text-purple-400">브라우저 설정에서 언제든지 거부</span>하실 수 있습니다.
          </p>
        </div>

        <p className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-300 font-normal mb-8">
          주식회사 메탈로라(이하 "회사")는 이용자에게 보다 원활하고 개인화된 서비스를 제공하기 위하여 쿠키(Cookie)를 사용합니다. 본 쿠키 정책은 쿠키의 사용 목적 및 관리 방법에 대해 설명합니다.
        </p>

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제1조 (쿠키의 정의)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>쿠키란 이용자가 웹사이트를 방문할 때 이용자의 기기(컴퓨터, 모바일 등)에 저장되는 소량의 데이터 파일로서, 웹사이트가 이용자의 브라우저를 인식하고 정보를 저장하거나 불러오는 데 사용됩니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제2조 (쿠키의 사용 목적)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div className="bg-white dark:bg-zinc-900/40 p-6 rounded-2xl flex items-start gap-4 border border-zinc-200 dark:border-white/5 shadow-sm">
            <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-zinc-900 dark:text-white border border-zinc-100 dark:border-white/5 flex-shrink-0"><Settings size={20} /></div>
            <div>
              <h4 className="text-zinc-900 dark:text-white font-bold mb-1">서비스 편의 제공</h4>
              <p className="text-[14px] text-zinc-900 dark:text-zinc-400 leading-relaxed font-medium">로그인 상태 유지 및 이용자의 환경 설정 값을 기억하여 편리한 이용을 돕습니다.</p>
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-900/40 p-6 rounded-2xl flex items-start gap-4 border border-zinc-200 dark:border-white/5 shadow-sm">
            <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-zinc-900 dark:text-white border border-zinc-100 dark:border-white/5 flex-shrink-0"><ShieldCheck size={20} /></div>
            <div>
              <h4 className="text-zinc-900 dark:text-white font-bold mb-1">보안 및 안정성</h4>
              <p className="text-[14px] text-zinc-900 dark:text-zinc-400 leading-relaxed font-medium">비정상적인 접속 시도를 탐지하고 안전한 결제 환경을 유지합니다.</p>
            </div>
          </div>
          <div className="bg-white dark:bg-zinc-900/40 p-6 rounded-2xl flex items-start gap-4 border border-zinc-200 dark:border-white/5 shadow-sm">
            <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-zinc-900 dark:text-white border border-zinc-100 dark:border-white/5 flex-shrink-0"><BarChart3 size={20} /></div>
            <div>
              <h4 className="text-zinc-900 dark:text-white font-bold mb-1">서비스 개선 분석</h4>
              <p className="text-[14px] text-zinc-900 dark:text-zinc-400 leading-relaxed font-medium">익명화된 방문 기록을 분석하여 더 나은 UI/UX를 설계하는 데 활용합니다.</p>
            </div>
          </div>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제3조 (쿠키의 종류)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-4">
            <li>
              <span className="font-bold text-zinc-900 dark:text-white">필수 쿠키</span><br/>
              서비스 제공에 반드시 필요한 쿠키로, 로그인 유지 및 보안 기능에 사용됩니다.
            </li>
            <li>
              <span className="font-bold text-zinc-900 dark:text-white">기능 쿠키</span><br/>
              이용자의 설정을 저장하여 보다 편리한 서비스를 제공합니다.
            </li>
            <li>
              <span className="font-bold text-zinc-900 dark:text-white">분석 쿠키</span><br/>
              이용자의 서비스 이용 패턴을 분석하여 서비스 개선에 활용됩니다.
            </li>
            <li>
              <span className="font-bold text-zinc-900 dark:text-white">마케팅 쿠키 (적용 시)</span><br/>
              이용자의 관심사에 맞는 광고 제공을 위해 사용될 수 있습니다.
            </li>
          </ol>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제4조 (쿠키의 저장 및 거부)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>이용자는 웹 브라우저 설정을 통해 쿠키 저장을 거부하거나 삭제할 수 있습니다.</li>
            <li>쿠키 저장을 거부할 경우 로그인 유지 등 일부 서비스 이용에 제한이 발생할 수 있습니다.</li>
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

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제5조 (제3자 쿠키)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <p>회사는 서비스 분석 및 기능 제공을 위해 제3자 서비스 제공자의 쿠키를 사용할 수 있습니다.<br/>이 경우 해당 쿠키는 각 제공자의 정책에 따라 관리됩니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">제6조 (쿠키 정책의 변경)</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <p>회사는 관련 법령 및 서비스 변경에 따라 본 쿠키 정책을 변경할 수 있으며, 변경 시 사전 공지합니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-white mt-10 mb-4">부칙</h3>
        <div className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-400 font-normal space-y-3">
          <p>본 정책은 2026년 3월 26일부터 시행됩니다.</p>
        </div>
      </div>
    )
  },
  agreement: {
    title: '커스텀 제작 및 콘텐츠 이용 동의서 (Metalora Consent v26.03.26)',
    content: (
      <div className="font-sans pb-8">
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-400 p-6 rounded-2xl font-semibold mb-10 leading-relaxed">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={20} className="text-red-600 dark:text-red-500" />
            <span className="text-red-700 dark:text-red-500 font-bold text-[16px]">저작권 및 초상권 책임 안내</span>
          </div>
          타인의 저작권, 초상권, 퍼블리시티권을 침해하는 콘텐츠(유명인 사진, 애니메이션 캐릭터, 타인의 창작물 등)를 무단으로 사용하여 발생하는 <span className="text-red-800 dark:text-red-300 font-bold">모든 민·형사상 법적 책임은 전적으로 주문자(이용자) 본인에게 귀속</span>됩니다.
        </div>

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제1조 [서비스의 성격 및 기술적 중립성]</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>METALORA(이하 "회사")는 이용자가 업로드한 이미지 및 데이터를 기반으로 주문 제작 상품을 생산하는 기술 기반 플랫폼입니다.</p>
          <ol className="list-decimal pl-5 space-y-3">
            <li>회사는 이용자가 제공한 데이터를 기반으로 상품을 물리적으로 구현하는 <span className="text-purple-600 dark:text-purple-400 font-medium">자동화된 제작 플랫폼</span>입니다.</li>
            <li>회사는 하루 수많은 주문을 처리함에 있어, 개별 이미지가 제3자의 권리를 침해하는지 여부를 <span className="text-purple-600 dark:text-purple-400 font-medium">사전에 일일이 심사하거나 검증할 의무를 지지 않습니다.</span></li>
            <li>다만, 회사는 관련 법령 준수 및 서비스 운영을 위해 필요한 경우 콘텐츠를 제한, 거부 또는 삭제할 수 있습니다.</li>
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

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">제5조 [데이터 보관 및 삭제]</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <ol className="list-decimal pl-5 space-y-3">
            <li>이용자가 업로드한 이미지 및 제작 데이터는 주문 이행을 위해 일정 기간 보관되며, 제작 완료 및 출고 후 <span className="text-purple-600 dark:text-purple-400 font-medium">최대 7일 이내 안전하게 영구 삭제</span>됩니다.</li>
            <li>단, 관계 법령에 따른 보관 의무가 있는 경우 해당 기간 동안 보관될 수 있습니다.</li>
          </ol>
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
          <p>이용자는 본 동의서의 각 항목을 확인하고 개별적으로 동의하며, 회사는 동의 사실(동의 시각, IP 주소, 버전 정보 등)을 기록 및 보관할 수 있습니다.<br/>해당 기록은 분쟁 발생 시 법적 증거로 활용됩니다.</p>
        </div>
        <Divider />

        <h3 className="text-[17px] font-semibold text-zinc-950 dark:text-white mt-10 mb-4">부칙</h3>
        <div className="text-[15px] leading-relaxed text-zinc-950 dark:text-zinc-200 font-normal space-y-3">
          <p>본 동의서는 2026년 3월 26일부터 시행됩니다.</p>
        </div>
      </div>
    )
  }
};

export default function Footer() {
  const { theme } = useTheme();
  const [modalState, setModalState] = useState<{ isOpen: boolean; key: keyof typeof policies | null }>({
    isOpen: false,
    key: null
  });

  const openModal = (key: keyof typeof policies) => {
    setModalState({ isOpen: true, key });
  };

  const closeModal = () => {
    setModalState({ isOpen: false, key: null });
  };

  useEffect(() => {
    const handleOpenPolicy = (e: CustomEvent) => {
      if (e.detail && policies[e.detail as keyof typeof policies]) {
        openModal(e.detail as keyof typeof policies);
      }
    };
    
    window.addEventListener('open-policy', handleOpenPolicy as EventListener);
    return () => window.removeEventListener('open-policy', handleOpenPolicy as EventListener);
  }, []);

  return (
    <footer className={`border-t w-full font-sans transition-colors duration-500 ${theme === 'dark' ? 'bg-zinc-950 border-white/5' : 'bg-white border-black/5'}`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 px-6 py-16 max-w-7xl mx-auto">
        {/* Left: Company Info */}
        <div className="text-center md:text-left text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed">
          <div className="mb-6 flex justify-center">
            <img 
              src="https://postfiles.pstatic.net/MjAyNjAzMzFfMTE2/MDAxNzc0OTQzMjQwMzI1.x_oF4Rn3jx1adpueuXOwP2XnNoym4vphKH-tVom_jE0g.2GiYCl0zR7EoUoU3WVtvErE0UK5Jef4b7otun81kHZAg.PNG/BLACK_V_(1).png?type=w3840" 
              alt="METALORA" 
              className={`h-6 w-auto object-contain opacity-80 hover:opacity-100 transition-all ${theme === 'dark' ? 'filter invert' : ''}`} 
              referrerPolicy="no-referrer"
            />
          </div>
          <p>상호명: 메탈로라(METALORA) | 대표자: 강동훈</p>
          <p>사업자등록번호: 776-19-02470</p>
          <p>통신판매업신고번호: 제XXXX-XXXX호</p>
          <p>주소: 울산광역시 울주군 서생면 진하해변길 8, 12층 1202호 라-04호실(아성일마레)</p>
          <p>이메일: a76688058@gmail.com</p>
          <p className="mt-6 text-zinc-700 dark:text-zinc-500">© 2026 METALORA. All rights reserved.</p>
        </div>

        {/* Center: Policy Links */}
        <div className="flex flex-wrap justify-center items-start gap-x-6 gap-y-4 text-sm font-medium">
          <button onClick={() => openModal('terms')} className={`${theme === 'dark' ? 'text-zinc-300 hover:text-white' : 'text-zinc-950 hover:text-black'} transition-colors cursor-pointer`}>이용약관</button>
          <button onClick={() => openModal('privacy')} className={`${theme === 'dark' ? 'text-zinc-300 hover:text-white' : 'text-zinc-950 hover:text-black'} transition-colors cursor-pointer`}>개인정보 처리방침</button>
          <button onClick={() => openModal('cookie')} className={`${theme === 'dark' ? 'text-zinc-300 hover:text-white' : 'text-zinc-950 hover:text-black'} transition-colors cursor-pointer`}>쿠키 정책</button>
          <button onClick={() => openModal('agreement')} className={`${theme === 'dark' ? 'text-zinc-300 hover:text-white' : 'text-zinc-950 hover:text-black'} transition-colors cursor-pointer`}>제작동의서</button>
        </div>

        {/* Right: Contact */}
        <div className="flex justify-center md:justify-end items-start text-sm font-medium">
          <a href="mailto:contact@metalora.me" className={`${theme === 'dark' ? 'text-zinc-200 hover:text-white' : 'text-zinc-800 hover:text-black'} transition-colors cursor-pointer`}>
            제휴/입점 문의
          </a>
        </div>
      </div>

      <PolicyModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        title={modalState.key ? policies[modalState.key].title : ''}
        content={modalState.key ? policies[modalState.key].content : null}
      />
    </footer>
  );
}
