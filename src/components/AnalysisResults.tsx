import { Download, CheckCircle, AlertTriangle, TrendingUp, Clock, Wrench, ShieldCheck, Info } from "lucide-react";
import jsPDF from "jspdf";

export interface FiveSScore {
  sort: number;
  setInOrder: number;
  shine: number;
  standardize: number;
  sustain: number;
}

export interface ScoreExplanations {
  sort: string;
  setInOrder: string;
  shine: string;
  standardize: string;
  sustain: string;
}

export interface AnalysisData {
  overview: string;
  beforeScores: FiveSScore;
  afterScores: FiveSScore;
  beforeExplanations: ScoreExplanations;
  afterExplanations: ScoreExplanations;
  recommendations: string[];
  improvements: string[];
  leanMaintenanceScore: number;
  leanMaintenanceExplanation: string;
}

const categories = [
{ key: "sort" as const, label: "Sort", jp: "Seiri", desc: "Removing unnecessary items" },
{ key: "setInOrder" as const, label: "Set in Order", jp: "Seiton", desc: "Organizing remaining items" },
{ key: "shine" as const, label: "Shine", jp: "Seiso", desc: "Cleaning and maintaining" },
{ key: "standardize" as const, label: "Standardize", jp: "Seiketsu", desc: "Creating standards" },
{ key: "sustain" as const, label: "Sustain", jp: "Shitsuke", desc: "Maintaining discipline" }];


const getScoreColor = (score: number) => {
  if (score >= 80) return "text-primary";
  if (score >= 60) return "text-warning";
  return "text-destructive";
};

const getBarBg = (score: number) => {
  if (score >= 80) return "bg-primary";
  if (score >= 60) return "bg-warning";
  return "bg-destructive";
};

interface Props {
  data: AnalysisData;
  beforeImage: string;
  afterImage: string;
  analysisTimestamp?: string;
  beforeUploadTime?: string;
  afterUploadTime?: string;
}

const AnalysisResults = ({ data, beforeImage, afterImage, analysisTimestamp, beforeUploadTime, afterUploadTime }: Props) => {
  const avgBefore = Math.round(Object.values(data.beforeScores).reduce((a, b) => a + b, 0) / 5);
  const avgAfter = Math.round(Object.values(data.afterScores).reduce((a, b) => a + b, 0) / 5);
  const timestamp = analysisTimestamp || new Date().toISOString();

  const formatDT = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " at " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const downloadPdf = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    // Title
    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.setTextColor(37, 99, 71);
    doc.text("ARCOLAB — 5S Workplace Analysis Report", pageWidth / 2, y, { align: "center" });
    y += 10;
    doc.setDrawColor(37, 99, 71);
    doc.setLineWidth(0.5);
    doc.line(15, y, pageWidth - 15, y);
    y += 10;

    // Timestamps
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Analysis Date: ${formatDT(timestamp)}`, 15, y);
    y += 5;
    if (beforeUploadTime) {
      doc.text(`Before Image Uploaded: ${formatDT(beforeUploadTime)}`, 15, y);
      y += 5;
    }
    if (afterUploadTime) {
      doc.text(`After Image Uploaded: ${formatDT(afterUploadTime)}`, 15, y);
      y += 5;
    }
    y += 8;

    // Overview
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.setTextColor(40, 40, 40);
    doc.text("Analysis Overview", 15, y);
    y += 7;
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    const overviewLines = doc.splitTextToSize(data.overview, pageWidth - 30);
    doc.text(overviewLines, 15, y);
    y += overviewLines.length * 5 + 8;

    // Lean Maintenance Score
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.setTextColor(40, 40, 40);
    doc.text("Lean Maintenance Score", 15, y);
    y += 7;
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.setTextColor(37, 99, 71);
    doc.text(`${data.leanMaintenanceScore}%`, 15, y);
    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    if (data.leanMaintenanceExplanation) {
      const lmLines = doc.splitTextToSize(data.leanMaintenanceExplanation, pageWidth - 30);
      doc.text(lmLines, 15, y);
      y += lmLines.length * 4.5 + 8;
    }

    // 5S Scores
    if (y > 240) {doc.addPage();y = 20;}
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.setTextColor(40, 40, 40);
    doc.text("5S Category Scores", 15, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont("times", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text("Category", 15, y);
    doc.text("Before", 85, y);
    doc.text("After", 105, y);
    doc.text("Change", 125, y);
    y += 6;

    categories.forEach((cat) => {
      if (y > 265) {doc.addPage();y = 20;}
      const before = data.beforeScores[cat.key];
      const after = data.afterScores[cat.key];
      doc.setFont("times", "bold");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      doc.text(`${cat.label} (${cat.jp})`, 15, y);
      doc.setFont("times", "normal");
      doc.text(`${before}%`, 85, y);
      doc.text(`${after}%`, 105, y);
      doc.setTextColor(37, 99, 71);
      doc.text(`+${after - before}%`, 125, y);
      y += 5;

      // Explanations
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      if (data.beforeExplanations?.[cat.key]) {
        const bLines = doc.splitTextToSize(`Before: ${data.beforeExplanations[cat.key]}`, pageWidth - 35);
        doc.text(bLines, 18, y);
        y += bLines.length * 3.5 + 1;
      }
      if (data.afterExplanations?.[cat.key]) {
        const aLines = doc.splitTextToSize(`After: ${data.afterExplanations[cat.key]}`, pageWidth - 35);
        doc.text(aLines, 18, y);
        y += aLines.length * 3.5 + 1;
      }
      y += 4;
    });

    y += 3;
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text(`Overall: ${avgBefore}% → ${avgAfter}% (+${avgAfter - avgBefore}%)`, 15, y);
    y += 12;

    // Recommendations
    if (y > 240) {doc.addPage();y = 20;}
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.setTextColor(40, 40, 40);
    doc.text("Recommendations", 15, y);
    y += 8;
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    data.recommendations.forEach((rec) => {
      if (y > 270) {doc.addPage();y = 20;}
      const lines = doc.splitTextToSize(`• ${rec}`, pageWidth - 30);
      doc.text(lines, 15, y);
      y += lines.length * 5 + 2;
    });

    // Improvements
    if (data.improvements.length > 0) {
      y += 8;
      if (y > 240) {doc.addPage();y = 20;}
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(40, 40, 40);
      doc.text("Key Improvements Observed", 15, y);
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      data.improvements.forEach((imp) => {
        if (y > 270) {doc.addPage();y = 20;}
        const lines = doc.splitTextToSize(`• ${imp}`, pageWidth - 30);
        doc.text(lines, 15, y);
        y += lines.length * 5 + 2;
      });
    }

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont("times", "italic");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("© 2026 ARCOLAB — 5S Workplace Analysis", pageWidth / 2, 287, { align: "center" });
      doc.text(`Page ${i} of ${totalPages}`, pageWidth - 15, 287, { align: "right" });
    }

    doc.save("ArcoLabs-5S-Analysis-Report.pdf");
  };

  return (
    <div className="space-y-8">
      {/* Timestamp */}
      <div className="bg-muted/50 rounded-lg border border-border px-5 py-3 space-y-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary flex-shrink-0" />
          <span>Analysis performed: <span className="font-semibold text-foreground">{formatDT(timestamp)}</span></span>
        </div>
        {beforeUploadTime &&
        <div className="flex items-center gap-2 pl-6">
            <span>Before image uploaded: <span className="font-semibold text-foreground">{formatDT(beforeUploadTime)}</span></span>
          </div>
        }
        {afterUploadTime &&
        <div className="flex items-center gap-2 pl-6">
            <span>After image uploaded: <span className="font-semibold text-foreground">{formatDT(afterUploadTime)}</span></span>
          </div>
        }
      </div>

      {/* Overview */}
      <div className="bg-card rounded-xl border border-border p-6 sm:p-8">
        <h3 className="text-lg font-heading font-semibold text-card-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Analysis Overview
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{data.overview}</p>
      </div>

      {/* Lean Maintenance Score with Explanation */}
      <div className="bg-card rounded-xl border border-border p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-4">
          <Wrench className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-heading font-semibold text-card-foreground">Lean Maintenance Score</h3>
        </div>
        <div className="flex items-end gap-3 mb-3">
          <span className={`text-3xl font-bold ${getScoreColor(data.leanMaintenanceScore)}`}>{data.leanMaintenanceScore}%</span>
        </div>
        <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-4">
          <div className={`h-full rounded-full ${getBarBg(data.leanMaintenanceScore)}`} style={{ width: `${data.leanMaintenanceScore}%` }} />
        </div>
        {data.leanMaintenanceExplanation &&
        <div className="bg-muted/40 rounded-lg p-4 border border-border">
            <p className="text-sm text-muted-foreground leading-relaxed flex gap-2">
              <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <span>{data.leanMaintenanceExplanation}</span>
            </p>
          </div>
        }
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Lean Maintenance</span> focuses on preventing equipment problems, keeping machines clean and organised, reducing downtime, and improving overall efficiency through TPM (Total Productive Maintenance) practices.
          </p>
        </div>
      </div>

      {/* Digital Governance Information */}
      <div className="bg-card rounded-xl border border-border p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-heading font-semibold text-card-foreground">Digital Governance</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          Digital Governance uses digital tools to monitor, control, and ensure workplace standards are followed consistently across all departments.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
          "Date & time of photo upload",
          "User / department details",
          "Location or area name",
          "Before–after comparison history",
          "5S score records & audit trail",
          "Monthly reports & manager approval"].
          map((item, i) =>
          <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <span>{item}</span>
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            This ensures <span className="font-semibold text-foreground">accountability</span>, <span className="font-semibold text-foreground">transparency</span>, and <span className="font-semibold text-foreground">continuous monitoring</span> of workplace standards.
          </p>
        </div>
      </div>

      {/* 5S Scores with Explanations */}
      <div className="bg-card rounded-xl border border-border p-6 sm:p-8">
        <h3 className="text-lg font-heading font-semibold text-card-foreground mb-6">5S Category Scores</h3>
        <div className="space-y-6">
          {categories.map((cat) => {
            const before = data.beforeScores[cat.key];
            const after = data.afterScores[cat.key];
            const beforeExp = data.beforeExplanations?.[cat.key];
            const afterExp = data.afterExplanations?.[cat.key];
            return (
              <div key={cat.key} className="space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-sm font-semibold text-foreground">{cat.label}</span>
                    
                    <p className="text-xs text-muted-foreground">{cat.desc}</p>
                  </div>
                  <span className="text-sm font-bold text-primary">+{after - before}%</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Before</span>
                      <span className={getScoreColor(before)}>{before}%</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${getBarBg(before)}`} style={{ width: `${before}%` }} />
                    </div>
                    {beforeExp &&
                    <div className="mt-1.5 flex items-start gap-1.5">
                      <span className="text-primary text-xs flex-shrink-0 mt-0.5">•</span>
                      <p className="text-xs text-muted-foreground leading-relaxed italic">{beforeExp}</p>
                    </div>
                    }
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">After</span>
                      <span className={getScoreColor(after)}>{after}%</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${getBarBg(after)}`} style={{ width: `${after}%` }} />
                    </div>
                    {afterExp &&
                    <div className="mt-1.5 flex items-start gap-1.5">
                      <span className="text-primary text-xs flex-shrink-0 mt-0.5">•</span>
                      <p className="text-xs text-muted-foreground leading-relaxed italic">{afterExp}</p>
                    </div>
                    }
                  </div>
                </div>
              </div>);

          })}
        </div>

        <div className="mt-6 pt-6 border-t border-border flex items-center justify-between">
          <span className="font-heading font-semibold text-foreground">Overall Score</span>
          <div className="flex items-center gap-3">
            <span className={`text-xl font-bold ${getScoreColor(avgBefore)}`}>{avgBefore}%</span>
            <span className="text-muted-foreground">→</span>
            <span className={`text-xl font-bold ${getScoreColor(avgAfter)}`}>{avgAfter}%</span>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-card rounded-xl border border-border p-6 sm:p-8">
        <h3 className="text-lg font-heading font-semibold text-card-foreground mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Recommendations
        </h3>
        <ul className="space-y-3">
          {data.recommendations.map((rec, i) =>
          <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
              <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">{i + 1}</span>
              {rec}
            </li>
          )}
        </ul>
      </div>

      {/* Key Improvements */}
      {data.improvements.length > 0 &&
      <div className="bg-card rounded-xl border border-border p-6 sm:p-8">
          <h3 className="text-lg font-heading font-semibold text-card-foreground mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            Key Improvements Observed
          </h3>
          <ul className="space-y-2">
            {data.improvements.map((imp, i) =>
          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                {imp}
              </li>
          )}
          </ul>
        </div>
      }

      {/* Download */}
      <button
        onClick={downloadPdf}
        className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm">

        <Download className="h-5 w-5" />
        Download PDF Report
      </button>
    </div>);

};

export default AnalysisResults;