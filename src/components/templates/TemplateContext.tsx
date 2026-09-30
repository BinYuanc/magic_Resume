import React, { createContext, useContext } from "react";
import { MenuSection } from "@/types/resume";
import type { TemplateSectionStyle } from "@/types/templateDefinition";

interface TemplateContextProps {
  templateId: string;
  menuSections: MenuSection[];
  sectionStyles?: Record<string, TemplateSectionStyle>;
}

const TemplateContext = createContext<TemplateContextProps | undefined>(undefined);

export const TemplateProvider: React.FC<{
  templateId: string;
  menuSections: MenuSection[];
  sectionStyles?: Record<string, TemplateSectionStyle>;
  children: React.ReactNode;
}> = ({ templateId, menuSections, sectionStyles, children }) => {
  return (
    <TemplateContext.Provider value={{ templateId, menuSections, sectionStyles }}>
      {children}
    </TemplateContext.Provider>
  );
};

export const useTemplateContext = () => {
  return useContext(TemplateContext);
};
