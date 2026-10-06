/**
 * 模块标题下划线的唯一定义：网页与 Word 导出必须一致，改这里就行。
 *
 * 取 1px 与官方原版一致。
 * 注意：网页预览会把 A4 整页按面板宽度缩放，1px 的细线在非整数缩放下
 * 会在 1px / 2px 之间跳（落在半像素上时还会变淡），这是缩放渲染的固有限制；
 * 若更在意预览里的观感一致，把这里改成 2 即可，Word 侧会同步。
 */
export const SECTION_TITLE_BORDER_WIDTH_PX = 1;

/** Word 边框宽度单位是 1/8 磅，1px = 0.75pt = 6/8pt。 */
export const SECTION_TITLE_BORDER_EIGHTHS_OF_POINT = SECTION_TITLE_BORDER_WIDTH_PX * 6;
