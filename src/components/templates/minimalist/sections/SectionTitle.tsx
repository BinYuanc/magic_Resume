import { useMemo } from "react";
import { GlobalSettings } from "@/types/resume";
import { useTemplateContext } from "../../TemplateContext";

interface SectionTitleProps {
    globalSettings?: GlobalSettings;
    type: string;
    title?: string;
    showTitle?: boolean;
}

const SectionTitle = ({ type, title, globalSettings, showTitle = true }: SectionTitleProps) => {
    const templateContext = useTemplateContext();
    const menuSections = templateContext?.menuSections ?? [];

    const renderTitle = useMemo(() => {
        if (type === "custom") return title;
        return menuSections.find((s) => s.id === type)?.title;
    }, [menuSections, type, title]);

    const sectionStyle = templateContext?.sectionStyles?.[type];
    const themeColor = sectionStyle?.color ?? globalSettings?.themeColor;
    if (!showTitle) return null;

    return (
        <h3
            className="pb-1 mb-2 tracking-widest uppercase font-bold"
            style={{
                fontSize: `${sectionStyle?.fontSize ?? globalSettings?.headerSize ?? 16}px`,
                color: themeColor,
                borderBottom: sectionStyle?.border ? `1px solid ${themeColor}` : undefined,
                marginBottom: `${sectionStyle?.itemSpacing ?? globalSettings?.paragraphSpacing ?? 0}px`,
                fontWeight: sectionStyle?.fontWeight,
                textAlign: sectionStyle?.align,
            }}
        >
            {renderTitle}
        </h3>
    );
};

export default SectionTitle;
