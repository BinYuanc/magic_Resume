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
            className="pb-2 border-b font-bold"
            style={{
                fontSize: `${sectionStyle?.fontSize ?? globalSettings?.headerSize ?? 18}px`,
                color: themeColor,
                borderColor: themeColor,
                // 注意：这里不能写 `borderBottom: undefined`。
                // React 会先展开 borderColor 的四条边，再用 shorthand 的 undefined 清空下边，
                // 结果下划线颜色回落到 Tailwind 默认灰（原来主题色的蓝线会"消失"）。
                borderBottom: sectionStyle?.border === false ? "none" : `1px solid ${themeColor ?? "currentColor"}`,
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
