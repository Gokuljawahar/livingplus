import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';

export default function TermsAndConditions() {
  const navigate = useNavigate();

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFB]">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#02224B]" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Terms & Conditions</h1>
              <p className="text-xs text-slate-400">Living Plus</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-16">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sm:p-10 space-y-8">

          <div>
            <p className="text-sm text-slate-500 leading-relaxed">
              These Terms of Service govern your access to and use of the services, websites, and applications offered by livingplus (the "Service"). Your access to and use of the Service is conditioned on your acceptance of and compliance with these Terms. By accessing or using the Service, you agree to be bound by these Terms. These Terms apply to all visitors, users and others who access or use the Service.
            </p>
          </div>

          <Section title="Ownership & Content">
            <p>
              This site is designed, updated and maintained independently by Living Plus. The content is owned by Living Plus.
            </p>
            <p>
              You may not modify, publish, transmit, transfer, sell, reproduce, create derivative work from, distribute, repost, perform, display, or in any way commercially exploit any of the content available in the website.
            </p>
            <p>
              If you disagree with any part of these terms, you may not access the Service.
            </p>
          </Section>

          <Section title="Bookings & Property Payments">
            <p>
              PG booking requests are subject to bed availability and approval by the property owner or authorized staff. A request is not a confirmed stay until its status is updated to approved by the property.
            </p>
            <p>
              Rent, deposits, and other property charges are recorded by the property. Unless an online payment option is explicitly enabled, payments are settled directly with the property and recorded as cash, bank transfer, or another offline method.
            </p>
          </Section>

          <Section title="Changes to Terms">
            <p>
              We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
            </p>
            <p>
              By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms. If you do not agree to the new terms, please stop using the Service.
            </p>
          </Section>

          <Section title="Contact Us">
            <p>
              If you have any questions about these Terms, please reach out to our support team.
            </p>
          </Section>

          <div className="pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 text-center">
              For any questions regarding these Terms, please reach out to our support team.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-slate-900 border-l-4 border-[#FEB109] pl-3">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-3 pl-1">
        {children}
      </div>
    </div>
  );
}
