import * as cat from '../../data_structure/Category';
import * as dhd from '../Render/DrawHandler';
import { CategoryRenderer } from './CategoryRenderer';
import * as pt from '../../utilities/Point';

export interface SeparatorRendererSettings<A> {
    separator_curve_attributes?: Partial<dhd.LineAttrs>;
}
export interface CategoryRendererSettings<
    L, M extends cat.Morphism<L>, A=L> {
    separator_settings?: SeparatorRendererSettings<A>;
    circle_anchors?: boolean;
    anchor_height: number;
    reversed?: boolean;
    rearrangement_width: number;
    composed_gap_dims: pt.Point;
    cap_products?: boolean;
    product_gap_width?: number;
    block_padding: pt.Point;
    product_reduction_c: number;
    product_reduction_m: number;
    loose_link: boolean;
    // MULTILINE SETTINGS
    offset_multiline: boolean;
    multiline_curve_width: number;
}

export interface StrideRendererSettings<
    A extends cat.Axis> extends CategoryRendererSettings<
    A,
    cat.StrideMorphism<A>,
    A> {
    reindexing_width: number;
    reindexing_hexagon_x: number;
    reindexing_hexagon_y: number;
}

export interface BroadcastedRendererSettings<
    B extends cat.Datatype = cat.Datatype, 
    A extends cat.Axis = cat.Axis> extends CategoryRendererSettings<
    cat.Array<B, A>,
    cat.Broadcasted<B, A>,
    A | B> {
    broadcast_offset_x: number;
    broadcast_core_gap: number;
    operation_core_dims: pt.Point;
    operation_softmax_dims: pt.Point;
    operation_multilinear_bite: number;
}
    

export enum AnchorAnnotationStyle {
    Default = 0,
    AfterOp = 1,
}

export const DefaultCategoryRendererSettings: CategoryRendererSettings<any, any, any> = {
    anchor_height: 20,
    circle_anchors: false,
    reversed: false,
    separator_settings: undefined,
    rearrangement_width: 30,
    composed_gap_dims: {x: 30, y: 20},
    cap_products: false,
    product_gap_width: 20,
    product_reduction_c: 30,
    product_reduction_m: 0.8,
    block_padding: {x: 10, y: 20},
    loose_link: true,
    offset_multiline: true,
    multiline_curve_width: 20,
}

export const DefaultStrideRendererSettings: StrideRendererSettings<cat.Axis> = {
    ...DefaultCategoryRendererSettings,
    reversed: true,
    rearrangement_width: 30,
    reindexing_width: 40,
    reindexing_hexagon_x: 10,
    reindexing_hexagon_y: 10,
    composed_gap_dims: {x: 10, y: 10},
}

export const DefaultBroadcastedRendererSettings: BroadcastedRendererSettings = {
    ...DefaultCategoryRendererSettings,
    separator_settings: {
        separator_curve_attributes: {
            'stroke-dasharray': '5,5',
            'stroke-width': '2px',
        }
    },
    broadcast_offset_x: 8,
    broadcast_core_gap: 30,
    operation_core_dims: {x: 30, y: 30},
    operation_softmax_dims: {x: 20, y: 20},
    operation_multilinear_bite: 10,
}