import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Building2 } from "lucide-react";

const offices = [
  {
    id: "softgel",
    name: "Softgel Healthcare Private Limited",
    short: "Softgel Healthcare",
  },
  {
    id: "solara",
    name: "Solara Active Pharma Sciences Limited",
    short: "Solara Active Pharma",
  },
  {
    id: "strides",
    name: "Strides Pharma",
    short: "Strides Pharma",
  },
];

const OfficeSelection = () => {
  const navigate = useNavigate();

  const handleSelect = (office: typeof offices[0]) => {
    sessionStorage.setItem("arcolab_office", JSON.stringify(office));
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 section-padding bg-background">
        <div className="container-max">
          <div className="max-w-3xl mx-auto text-center">
            {/* Header */}
            <div className="mb-10">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-4 py-1.5 mb-5">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">Check-In</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-bold text-foreground mb-3">
                Select Your Office
              </h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                Choose your facility below to begin your workplace analysis check-in.
              </p>
            </div>

            {/* Office Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {offices.map((office) => (
                <button
                  key={office.id}
                  onClick={() => handleSelect(office)}
                  className="group flex flex-col items-center gap-5 bg-card border-2 border-border hover:border-primary/50 rounded-2xl p-6 sm:p-8 transition-all duration-200 hover:shadow-lg hover:-translate-y-1 text-left w-full cursor-pointer"
                >
                  {/* Logo placeholder with initial */}
                  <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors flex-shrink-0">
                    <span className="text-2xl font-heading font-extrabold text-primary">
                      {office.short.charAt(0)}
                    </span>
                  </div>

                  <div className="space-y-2 flex-1 text-center">
                    <p className="text-sm font-heading font-bold text-foreground leading-snug">
                      {office.name}
                    </p>
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                      <span className="text-xs font-semibold text-primary">Check In Online</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <p className="mt-8 text-xs text-muted-foreground">
              Your selection will be recorded with your analysis for audit purposes.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default OfficeSelection;
