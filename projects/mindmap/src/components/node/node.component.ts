import {
    ChangeDetectionStrategy,
    Component,
    ComponentFactoryResolver,
    ComponentRef,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    SimpleChanges,
    ViewContainerRef
} from '@angular/core';
import { drawNode } from '../../draw/node';
import { RoughSVG } from 'roughjs/bin/svg';
import { MindmapNode } from '../../interfaces/node';
import { drawLine } from '../../draw/line';
import { drawRoundRectangle, getRectangleByNode, hitMindmapNode } from '../../utils/graph';
import { MINDMAP_NODE_KEY, PRIMARY_COLOR } from '../../constants';
import { HAS_SELECTED_MINDMAP_ELEMENT, ELEMENT_GROUP_TO_COMPONENT, MINDMAP_NODE_TO_COMPONENT } from '../../utils/weak-maps';
import { Selection } from 'plait/interfaces/selection';
import { PlaitRichtextComponent, setFullSelectionAndFocus } from 'richtext';
import { debounceTime } from 'rxjs/operators';
import { drawMindmapNodeRichtext, updateMindmapNodeRichtextLocation } from '../../draw/richtext';
import { createG, toPoint } from 'plait/utils/dom';
import { MindmapElement } from '../../interfaces/element';
import { fromEvent } from 'rxjs';
import { HOST_TO_ROUGH_SVG } from 'plait/utils/weak-maps';
import { PlaitBoard } from 'plait/interfaces/board';

@Component({
    selector: 'plait-mindmap-node',
    template: `
        <plait-mindmap-node
            *ngFor="let childNode of node?.children; trackBy: trackBy"
            [host]="host"
            [mindmapGGroup]="mindmapGGroup"
            [node]="childNode"
            [parent]="node"
            [selection]="selection"
            [board]="board"
        ></plait-mindmap-node>
    `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MindmapNodeComponent implements OnInit, OnChanges, OnDestroy {
    initialized = false;

    isEditable = false;

    roughSVG!: RoughSVG;

    gGroup!: SVGGElement;

    @Input() node!: MindmapNode;

    @Input() parent!: MindmapNode;

    @Input() mindmapGGroup!: SVGGElement;

    @Input() selection: Selection | null = null;

    @Input() host!: SVGElement;

    @Input() board!: PlaitBoard;

    selectedMarks: SVGGElement[] = [];

    nodeG: SVGGElement | null = null;

    lineG?: SVGGElement;

    richtextG?: SVGGElement;

    richtextComponentRef?: ComponentRef<PlaitRichtextComponent>;

    constructor(private componentFactoryResolver: ComponentFactoryResolver, private viewContainerRef: ViewContainerRef) {}

    ngOnInit(): void {
        this.gGroup = createG();
        this.gGroup.setAttribute(MINDMAP_NODE_KEY, 'true');
        this.mindmapGGroup.prepend(this.gGroup);
        this.roughSVG = HOST_TO_ROUGH_SVG.get(this.host) as RoughSVG;
        this.drawNode();
        this.drawLine();
        this.drawRichtext();
        this.initialized = true;
        ELEMENT_GROUP_TO_COMPONENT.set(this.gGroup, this);
        MINDMAP_NODE_TO_COMPONENT.set(this.node as MindmapNode, this);
    }

    drawNode() {
        // console.log('drawNode');
        this.destroyNode();
        this.nodeG = drawNode(this.roughSVG as RoughSVG, this.node as MindmapNode);
        this.gGroup.prepend(this.nodeG);
    }

    destroyNode() {
        if (this.nodeG) {
            this.nodeG.remove();
            this.nodeG = null;
        }
    }

    drawLine() {
        if (this.parent) {
            if (this.lineG) {
                this.lineG.remove();
            }
            this.lineG = drawLine(this.roughSVG as RoughSVG, this.parent as MindmapNode, this.node as MindmapNode, true, 1);
            this.gGroup.append(this.lineG);
        }
    }

    destroyLine() {
        if (this.parent) {
            if (this.lineG) {
                this.lineG.remove();
            }
        }
    }

    drawSelectedState() {
        // console.log('drawSelectedState');
        this.destroySelectedState();
        const selected = HAS_SELECTED_MINDMAP_ELEMENT.get(this.node.data);
        if (selected || this.isEditable) {
            const { x, y, width, height } = getRectangleByNode(this.node as MindmapNode);
            const selectedStrokeG = drawRoundRectangle(
                this.roughSVG as RoughSVG,
                x - 2,
                y - 2,
                x + width + 2,
                y + height + 2,
                { stroke: PRIMARY_COLOR, strokeWidth: 2, fill: '' },
                true
            );
            this.gGroup.appendChild(selectedStrokeG);
            this.selectedMarks.push(selectedStrokeG);
            if (this.richtextComponentRef?.instance.readonly === true) {
                const selectedBackgroundG = drawRoundRectangle(
                    this.roughSVG as RoughSVG,
                    x - 2,
                    y - 2,
                    x + width + 2,
                    y + height + 2,
                    { stroke: PRIMARY_COLOR, fill: PRIMARY_COLOR, fillStyle: 'solid' },
                    true
                );
                selectedBackgroundG.style.opacity = '0.15';
                // 影响双击事件
                selectedBackgroundG.style.pointerEvents = 'none';
                this.gGroup.appendChild(selectedBackgroundG);
                this.selectedMarks.push(selectedBackgroundG, selectedStrokeG);
            }
        }
    }

    destroySelectedState() {
        this.selectedMarks.forEach(g => g.remove());
        this.selectedMarks = [];
    }

    drawRichtext() {
        const { richTextG, richtextComponentRef } = drawMindmapNodeRichtext(
            this.node as MindmapNode,
            this.componentFactoryResolver,
            this.viewContainerRef
        );
        this.richtextComponentRef = richtextComponentRef;
        this.richtextG = richTextG;
        this.gGroup.append(richTextG);
    }

    destroyRichtext() {
        if (this.richtextG) {
            this.richtextG.remove();
        }
        if (this.richtextComponentRef) {
            this.richtextComponentRef.destroy();
        }
    }

    updateRichtextLocation() {
        updateMindmapNodeRichtextLocation(this.node as MindmapNode, this.richtextG as SVGGElement);
    }

    ngOnChanges(changes: SimpleChanges): void {
        const selection = changes['selection'];
        if (selection) {
            this.drawSelectedState();
        }
        if (this.initialized) {
            const node = changes['node'];
            if (node) {
                this.drawNode();
                this.drawLine();
                this.updateRichtextLocation();
                this.drawSelectedState();
                MINDMAP_NODE_TO_COMPONENT.set(this.node as MindmapNode, this);
            }
        }
    }

    startEditText(valueChange: (element: Partial<MindmapElement>) => void, exitCallback: () => void) {
        this.isEditable = true;
        if (!this.richtextComponentRef) {
            throw new Error('undefined richtextComponentRef');
        }
        const richtextInstance = this.richtextComponentRef.instance;
        if (richtextInstance.readonly) {
            richtextInstance.readonly = false;
            this.richtextComponentRef.changeDetectorRef.markForCheck();
            setTimeout(() => {
                this.drawSelectedState();
                setFullSelectionAndFocus(richtextInstance.editor);
            }, 0);
        }
        let richtext = richtextInstance.value;
        // 增加 debounceTime 等待 DOM 渲染完成后再去取文本宽高
        const valueChange$ = richtextInstance.onChange.pipe(debounceTime(0)).subscribe(event => {
            if (richtext === event.value) {
                return;
            }
            richtext = event.value;
            // 更新富文本、更新宽高
            const { width, height } = richtextInstance.editable.getBoundingClientRect();
            const newElement = { value: richtext, width, height } as MindmapElement;
            valueChange(newElement);
        });
        const composition$ = richtextInstance.composition.subscribe(event => {
            const { width, height } = richtextInstance.editable.getBoundingClientRect();
            if (event.isComposing && (width !== this.node.data.width || height !== this.node.data.height)) {
                const newElement: Partial<MindmapElement> = { width, height };
                valueChange(newElement);
            }
        });
        const mousedown$ = fromEvent<MouseEvent>(document, 'mousedown').subscribe((event: MouseEvent) => {
            const point = toPoint(event.x, event.y, this.host);
            if (!hitMindmapNode(this.board, point, this.node as MindmapNode)) {
                event.preventDefault();
                exitHandle();
            }
        });
        const keydown$ = fromEvent<KeyboardEvent>(document, 'keydown').subscribe((event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                exitHandle();
                this.drawSelectedState();
            }
        });

        const exitHandle = () => {
            // unsubscribe
            valueChange$.unsubscribe();
            composition$.unsubscribe();
            mousedown$.unsubscribe();
            keydown$.unsubscribe();
            // editable status
            richtextInstance.readonly = true;
            this.richtextComponentRef?.changeDetectorRef.markForCheck();
            this.isEditable = false;
            // callback
            exitCallback();
        };
    }

    trackBy = (index: number, node: MindmapNode) => {
        return index;
    };

    ngOnDestroy(): void {
        this.destroyRichtext();
        this.gGroup.remove();
        ELEMENT_GROUP_TO_COMPONENT.delete(this.gGroup);
        MINDMAP_NODE_TO_COMPONENT.delete(this.node as MindmapNode);
    }
}
