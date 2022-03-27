import { Point } from "roughjs/bin/geometry";
import { ElementType, Element } from "../interfaces/element";
import { addElement, Paper } from "../interfaces/paper";
import { PointerType } from "../interfaces/pointer";
import { startEditRichtext } from "../utils/foreign-object";
import { generateKey } from "../utils/key";
import { toPoint } from "../utils/position";
import { setFullSelectionAndFocus } from "../utils/richtext";
import { ELEMENT_TO_RICHTEXT_REF, HOSTSVGG_TO_ELEMENT } from "../utils/weak-maps";

export function textPaper<T extends Paper>(paper: T) {
    const { mousedown, dblclick } = paper;
    paper.mousedown = (event: MouseEvent) => {
        if (paper.pointer === PointerType.text) {
            const start = toPoint(event.x, event.y, paper.container as SVGElement);
            const end = [start[0] + 32, start[1] + 22] as Point;
            addElement(paper, createText(start, end));
            paper.pointer = PointerType.pointer;
            return;
        }
        mousedown(event);
    }
    paper.dblclick = (event: MouseEvent) => {
        if (event.target instanceof HTMLElement) {
            const plaitRichtext = event.target.closest('.plait-richtext-container');
            const g = plaitRichtext?.parentElement?.parentElement;
            const element = g && g instanceof SVGGElement && HOSTSVGG_TO_ELEMENT.get(g);
            const richTextRef = element && ELEMENT_TO_RICHTEXT_REF.get(element);
            if (richTextRef && element) {
                setTimeout(() => {
                    setFullSelectionAndFocus(richTextRef.instance.editor);
                    startEditRichtext(paper, element, g as SVGGElement);
                }, 200);
            }
        }
        // 先通过选区找对应的富文本组件
        // const elements = [...paper.elements];
        // elements.forEach((value) => {
        //     const isSelected = Element.isIntersected(value, paper.selection);
        //     if (isSelected && value.type === ElementType.text) {
        //         const elementComponent = ELEMENT_TO_COMPONENTS.get(value);
        //         const editor = elementComponent?.editor;
        //         if (elementComponent && elementComponent.richtextComponentRef) {
        //             elementComponent.richtextComponentRef.instance.readonly = false;
        //             elementComponent.richtextComponentRef.changeDetectorRef.markForCheck();
        //             // 更新宽度
        //             IS_TEXT_EDITABLE.set(paper, true);
        //             editText(elementComponent.g);
        //         }
        //         setTimeout(() => {
        //             if (editor) {
        //                 setFullSelectionAndFocus(editor);
        //             }
        //         }, 200);
        //     }
        // });
        // if (event.target instanceof HTMLElement && event)
        dblclick(event);
    }
    return paper;
}

export function createText(start: Point, end: Point): Element {
    return {
        type: ElementType.text, points: [start, end], key: generateKey(), richtext: {
            children: [
                { text: '' }
            ]
        }
    };
}