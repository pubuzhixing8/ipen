import {
    AfterViewChecked,
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    NgZone,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    Renderer2,
    SimpleChanges,
    ViewChild
} from '@angular/core';
import { withRichtext } from '../plugins/with-richtext';
import { BaseRange, createEditor, Editor, Element, Node, Operation, Range, Transforms } from 'slate';
import { BeforeInputEvent, OnChangeEvent } from '../interface/event';
import { RichtextEditor, toSlateRange } from '../plugins/richtext-editor';
import { getDefaultView } from '../utils/dom';
import { EDITOR_TO_ELEMENT, EDITOR_TO_ON_CHANGE, EDITOR_TO_WINDOW, ELEMENT_TO_NODE, IS_FOCUSED, IS_NATIVE_INPUT } from '../utils/weak-maps';
import { withMarks } from '../plugins/with-marks';
import { PlaitCompositionEvent } from '../interface/composition';

const NATIVE_INPUT_TYPES = ['insertText'];

@Component({
    selector: 'plait-richtext',
    templateUrl: './richtext.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        class: 'plait-richtext-container',
        '[attr.contenteditable]': 'readonly ? undefined : true',
        '[attr.readonly]': 'readonly'
    }
})
export class PlaitRichtextComponent implements OnInit, AfterViewInit, AfterViewChecked, OnChanges, OnDestroy {
    initialized = false;

    isComposing = false;

    eventListeners: (() => void)[] = [];

    @Input()
    value: Element | undefined;

    @Input()
    readonly = false;

    @Output()
    onChange: EventEmitter<OnChangeEvent> = new EventEmitter();

    @Output()
    blur: EventEmitter<FocusEvent> = new EventEmitter();

    @Output()
    focus: EventEmitter<FocusEvent> = new EventEmitter();

    @Output()
    composition: EventEmitter<PlaitCompositionEvent> = new EventEmitter();

    editor = withMarks(withRichtext(createEditor()));

    get bindValue(): Element {
        return this.editor.children[0] as Element;
    }

    get editable() {
        return this.elementRef.nativeElement;
    }

    constructor(
        public renderer2: Renderer2,
        private ngZone: NgZone,
        private cdr: ChangeDetectorRef,
        private elementRef: ElementRef<HTMLElement>
    ) {}

    ngOnInit(): void {
        if (this.value) {
            this.editor.children = [this.value];
        }
    }

    ngAfterViewInit(): void {
        this.initialize();
        this.initialized = true;
    }

    ngAfterViewChecked(): void {}

    initialize() {
        let window = getDefaultView(this.editable);
        EDITOR_TO_WINDOW.set(this.editor, window);
        EDITOR_TO_ELEMENT.set(this.editor, this.editable);
        ELEMENT_TO_NODE.set(this.editable, this.editor);

        this.ngZone.runOutsideAngular(() => {
            // 拦截输入行为
            this.addEventListener('beforeinput', (evt: Event) => this.onBeforeInput(evt as BeforeInputEvent));
            this.addEventListener('keydown', (event: Event) => this.onKeydown(event as KeyboardEvent));
            this.addEventListener('compositionstart', (evt: Event) => this.compositionStart(evt as CompositionEvent));
            this.addEventListener('compositionupdate', (evt: Event) => this.compositionUpdate(evt as CompositionEvent));
            this.addEventListener('compositionend', (evt: Event) => this.compositionEnd(evt as CompositionEvent));
            this.addEventListener('focus', (evt: Event) => this.onFocus(evt as FocusEvent));
            this.addEventListener('blur', (evt: Event) => this.onBlur(evt as FocusEvent));
            // 监控选区改变
            this.addEventListener(
                'selectionchange',
                () => {
                    if (this.readonly) {
                        return;
                    }
                    this.toSlateSelection();
                },
                window.document
            );
        });
        // 监控 onChange
        EDITOR_TO_ON_CHANGE.set(this.editor, () => {
            this.onChangeHandle();
        });
    }

    onChangeHandle() {
        this.onChange.emit({ value: this.editor.children[0] as Element, operations: this.editor.operations });
        const isValueChange = this.editor.operations.some(op => !Operation.isSelectionOperation(op));
        if (!IS_NATIVE_INPUT.get(this.editor)) {
            if (isValueChange) {
                this.cdr.detectChanges();
            }
            this.toNativeSelection();
        }
        IS_NATIVE_INPUT.set(this.editor, false);
    }

    private onBeforeInput(event: BeforeInputEvent) {
        IS_NATIVE_INPUT.set(this.editor, false);
        const editor = this.editor;
        const { selection } = editor;
        const { inputType: type } = event;
        const data = event.dataTransfer || event.data || undefined;
        // These two types occur while a user is composing text and can't be
        // cancelled. Let them through and wait for the composition to end.
        if (type === 'insertCompositionText' || type === 'deleteCompositionText') {
            return;
        }

        let native = false;

        if (
            NATIVE_INPUT_TYPES.includes(type) &&
            selection &&
            Range.isCollapsed(selection) &&
            !editor.marks
            // Chrome has issues correctly editing the start of nodes: https://bugs.chromium.org/p/chromium/issues/detail?id=1249405
            // When there is an inline element, e.g. a link, and you select
            // right after it (the start of the next node).
        ) {
            native = true;
        }

        if (native) {
            IS_NATIVE_INPUT.set(this.editor, true);
        } else {
            event.preventDefault();
        }

        // COMPAT: If the selection is expanded, even if the command seems like
        // a delete forward/backward command it should delete the selection.
        if (selection && Range.isExpanded(selection) && type.startsWith('delete')) {
            const direction = type.endsWith('Backward') ? 'backward' : 'forward';
            Editor.deleteFragment(editor, { direction });
            return;
        }

        switch (type) {
            case 'deleteByComposition':
            case 'deleteByCut':
            case 'deleteByDrag': {
                Editor.deleteFragment(editor);
                break;
            }

            case 'deleteContent':
            case 'deleteContentForward': {
                Editor.deleteForward(editor);
                break;
            }

            case 'deleteContentBackward': {
                Editor.deleteBackward(editor);
                break;
            }

            case 'deleteEntireSoftLine': {
                Editor.deleteBackward(editor, { unit: 'line' });
                Editor.deleteForward(editor, { unit: 'line' });
                break;
            }

            case 'deleteHardLineBackward': {
                Editor.deleteBackward(editor, { unit: 'block' });
                break;
            }

            case 'deleteSoftLineBackward': {
                Editor.deleteBackward(editor, { unit: 'line' });
                break;
            }

            case 'deleteHardLineForward': {
                Editor.deleteForward(editor, { unit: 'block' });
                break;
            }

            case 'deleteSoftLineForward': {
                Editor.deleteForward(editor, { unit: 'line' });
                break;
            }

            case 'deleteWordBackward': {
                Editor.deleteBackward(editor, { unit: 'word' });
                break;
            }

            case 'deleteWordForward': {
                Editor.deleteForward(editor, { unit: 'word' });
                break;
            }

            case 'insertLineBreak':
            case 'insertParagraph': {
                Editor.insertBreak(editor);
                break;
            }

            case 'insertFromComposition': {
                // just be fired in safari, so insert text from compositionend
                break;
            }
            case 'insertFromDrop':
            case 'insertFromPaste':
            case 'insertFromYank':
            case 'insertReplacementText':
            case 'insertText': {
                // use a weak comparison instead of 'instanceof' to allow
                // programmatic access of paste events coming from external windows
                // like cypress where cy.window does not work realibly
                if (data?.constructor.name === 'DataTransfer') {
                } else if (typeof data === 'string') {
                    Editor.insertText(editor, data);
                }
                break;
            }
        }
    }

    private onKeydown(event: KeyboardEvent) {
        this.editor.keydown(event);
    }

    private compositionStart(event: CompositionEvent) {
        this.isComposing = true;
        this.composition.emit({ originEvent: event, isComposing: this.isComposing });
    }

    private compositionUpdate(event: CompositionEvent) {
        this.isComposing = true;
        this.composition.emit({ originEvent: event, isComposing: this.isComposing });
    }

    private compositionEnd(event: CompositionEvent) {
        this.isComposing = false;
        this.composition.emit({ originEvent: event, isComposing: this.isComposing });
        preventDefaultIME(event, this.editor);
        Editor.insertText(this.editor, event.data);
    }

    ngOnChanges(changes: SimpleChanges): void {}

    private onFocus(event: FocusEvent) {
        IS_FOCUSED.set(this.editor, true);
        this.focus.emit(event);
    }

    private onBlur(event: FocusEvent) {
        IS_FOCUSED.delete(this.editor);
        this.blur.emit(event);
    }

    private toNativeSelection() {
        if (this.isComposing) {
            return;
        }
        const window = RichtextEditor.getWindow(this.editor);
        const domSelection = window.getSelection();
        const { selection } = this.editor;
        if (selection && domSelection) {
            try {
                // detect real slate selection
                const slateRange = toSlateRange(this.editor, domSelection, false);
                if (Range.equals(selection, slateRange)) {
                    return;
                }
            } catch (error) {}

            const newDomRange = selection && RichtextEditor.toDOMRange(this.editor, selection);
            if (newDomRange) {
                const isBackward = Range.isBackward(selection);
                if (isBackward) {
                    domSelection.setBaseAndExtent(
                        newDomRange.endContainer,
                        newDomRange.endOffset,
                        newDomRange.startContainer,
                        newDomRange.startOffset
                    );
                } else {
                    domSelection.setBaseAndExtent(
                        newDomRange.startContainer,
                        newDomRange.startOffset,
                        newDomRange.endContainer,
                        newDomRange.endOffset
                    );
                }
                return;
            }
        }
        domSelection?.removeAllRanges();
    }

    private toSlateSelection() {
        if (this.isComposing) {
            return;
        }
        const domSelection = window.getSelection();
        if (domSelection) {
            if (!this.editable.contains(domSelection.anchorNode) || !this.editable.contains(domSelection.focusNode) || this.readonly) {
                return;
            }
            const slateRange = RichtextEditor.toSlateRange(this.editor, domSelection);
            if (slateRange && this.editor.selection && Range.equals(slateRange, this.editor.selection as BaseRange)) {
                // detect unnormalized native selection
                this.toNativeSelection();
                return;
            }
            Transforms.select(this.editor, slateRange);
            return;
        }
        if (this.editor.selection) {
            Transforms.deselect(this.editor);
        }
    }

    private addEventListener(eventName: string, callback: EventListener, target: HTMLElement | Document = this.editable) {
        this.eventListeners.push(
            this.renderer2.listen(target, eventName, (event: Event) => {
                callback(event);
            })
        );
    }

    trackBy = (index: number, node: Node) => {
        return index;
    };

    ngOnDestroy(): void {
        this.eventListeners.forEach(unlisten => {
            unlisten();
        });
        EDITOR_TO_WINDOW.delete(this.editor);
        EDITOR_TO_ELEMENT.delete(this.editor);
        ELEMENT_TO_NODE.delete(this.editable);
    }
}

/**
 * remove default insert from composition
 * @param text
 */
const preventDefaultIME = (event: Event, editor: RichtextEditor) => {
    const types = ['compositionend', 'insertFromComposition'];
    if (!types.includes(event.type)) {
        return;
    }
    const insertText = (event as CompositionEvent).data;
    const window = RichtextEditor.getWindow(editor);
    const domSelection = window.getSelection();
    // ensure text node insert composition input text
    if (
        domSelection &&
        insertText &&
        domSelection.anchorNode instanceof Text &&
        domSelection.anchorNode.textContent?.endsWith(insertText)
    ) {
        const textNode = domSelection.anchorNode;
        textNode.splitText(textNode.length - insertText.length).remove();
    }
};
