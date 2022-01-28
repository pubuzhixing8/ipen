import { ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from "@angular/core";
import { Point } from "roughjs/bin/geometry";
import { RoughSVG } from "roughjs/bin/svg";
import { Selection } from "../interfaces/selection";
import { Element, ElementType } from "../interfaces/element";

@Component({
    selector: 'linear-path',
    template: '',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LinearPathComponent implements OnInit, OnDestroy, OnChanges {
    @Input() element!: Element;

    @Input() rc!: RoughSVG;

    @Input() selection!: Selection;

    svgElement!: SVGGElement;

    rectSvgElement: SVGGElement | undefined;

    constructor(private elementRef: ElementRef) { }

    ngOnInit(): void {
        if (this.element.type === ElementType.linearPath) {
            this.svgElement = this.rc.linearPath(this.element.points, { stroke: this.element.color, strokeWidth: this.element.strokeWidth });
            this.elementRef.nativeElement.parentElement.appendChild(this.svgElement);
        } else if(this.element.type === ElementType.rectangle) {
            const start = this.element.points[0];
            const end = this.element.points[1];
            this.svgElement = this.rc.rectangle(start[0], start[1], end[0] - start[0], end[1] - start[1], { stroke: this.element.color, strokeWidth: this.element.strokeWidth });
            this.elementRef.nativeElement.parentElement.appendChild(this.svgElement);
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        const selectionChange = changes['selection'];
        // if (!selectionChange.firstChange) {
        if (Element.isSelected(this.element, this.selection)) {
            if (!this.rectSvgElement) {
                this.addSelectedRect();
            }
        } else {
            this.removeSelectedRect();
        }
        // }
    }

    addSelectedRect() {
        const rect = Element.getRect(this.element);
        this.rectSvgElement = this.rc.rectangle(rect.x - 3, rect.y - 3, rect.width + 6, rect.height + 6, { strokeLineDash: [6, 6], strokeWidth: 1, stroke: '#348fe4' });
        this.elementRef.nativeElement.parentElement.appendChild(this.rectSvgElement);
    }

    removeSelectedRect() {
        if (this.rectSvgElement) {
            this.rectSvgElement.remove();
            this.rectSvgElement = undefined;
        }
    }

    ngOnDestroy(): void {
        this.svgElement.remove();
        this.removeSelectedRect();
    }
}