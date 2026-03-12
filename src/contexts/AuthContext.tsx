import { createContext, useContext, useState, ReactNode } from "react";

export interface Employee {
  employeeId: string;
  name: string;
  department: string;
}

export interface Office {
  id: string;
  name: string;
  short: string;
}

interface AuthContextType {
  employee: Employee | null;
  office: Office | null;
  login: (employee: Employee) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  employee: null,
  office: null,
  login: () => {},
  logout: () => {},
  isAuthenticated: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [employee, setEmployee] = useState<Employee | null>(() => {
    const stored = sessionStorage.getItem("arcolab_employee");
    return stored ? JSON.parse(stored) : null;
  });

  const [office, setOffice] = useState<Office | null>(() => {
    const stored = sessionStorage.getItem("arcolab_office");
    return stored ? JSON.parse(stored) : null;
  });

  const login = (emp: Employee) => {
    setEmployee(emp);
    sessionStorage.setItem("arcolab_employee", JSON.stringify(emp));
    // Refresh office from session in case it was set on office selection page
    const storedOffice = sessionStorage.getItem("arcolab_office");
    if (storedOffice) setOffice(JSON.parse(storedOffice));
  };

  const logout = () => {
    setEmployee(null);
    setOffice(null);
    sessionStorage.removeItem("arcolab_employee");
    sessionStorage.removeItem("arcolab_office");
  };

  return (
    <AuthContext.Provider value={{ employee, office, login, logout, isAuthenticated: !!employee }}>
      {children}
    </AuthContext.Provider>
  );
};
