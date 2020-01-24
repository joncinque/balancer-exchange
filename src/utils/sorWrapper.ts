import { BigNumber } from './bignumber';
import {
    BONE,
    calcInGivenOut,
    calcOutGivenIn,
    calcSpotPrice,
} from './balancerCalcs';
import * as helpers from './helpers';
import { bnum, formatPoolData } from './helpers';
import sor from 'balancer-sor';
import { SwapMethods } from '../stores/SwapForm';
import { Pool, SorSwaps, Swap } from '../stores/Proxy';

export const formatSwapsExactAmountIn = (
    sorSwaps: SorSwaps,
    poolData: Pool[],
    maxPrice: BigNumber,
    minAmountOut: BigNumber
): Swap[] => {
    const swaps: Swap[] = [];
    for (let i = 0; i < sorSwaps.inputAmounts.length; i++) {
        let swapAmount = sorSwaps.inputAmounts[i];
        let swap: Swap = {
            pool: sorSwaps.selectedBalancers[i],
            tokenInParam: swapAmount
                .times(BONE)
                .integerValue(3)
                .toString(),
            tokenOutParam: minAmountOut.toString(),
            maxPrice: maxPrice.toString(),
        };
        swaps.push(swap);
    }
    return swaps;
};

export const formatSwapsExactAmountOut = (
    sorSwaps: SorSwaps,
    poolData: Pool[],
    maxPrice: BigNumber,
    maxAmountIn: BigNumber
): Swap[] => {
    const swaps: Swap[] = [];
    for (let i = 0; i < sorSwaps.inputAmounts.length; i++) {
        let swapAmount = sorSwaps.inputAmounts[i];
        let swap: Swap = {
            pool: sorSwaps.selectedBalancers[i],
            tokenInParam: maxAmountIn.toString(),
            tokenOutParam: swapAmount
                .times(BONE)
                .integerValue(3)
                .toString(),
            maxPrice: maxPrice.toString(),
        };
        swaps.push(swap);
    }
    return swaps;
};

export const findPoolsWithTokens = async (
    tokenIn: string,
    tokenOut: string,
    fromWei: boolean = false
): Promise<Pool[]> => {
    let pools = await sor.getPoolsWithTokens(tokenIn, tokenOut);

    if (pools.pools.length === 0)
        throw Error('There are no pools with selected tokens');

    let poolData: Pool[] = [];
    pools.pools.forEach(p => {
        let tI: any = p.tokens.find(
            t => helpers.toChecksum(t.address) === helpers.toChecksum(tokenIn)
        );
        let tO: any = p.tokens.find(
            t => helpers.toChecksum(t.address) === helpers.toChecksum(tokenOut)
        );
        let obj: Pool = {
            id: helpers.toChecksum(p.id),
            balanceIn: bnum(tI.balance),
            balanceOut: bnum(tO.balance),
            weightIn: bnum(tI.denormWeight).div(bnum(p.totalWeight)),
            weightOut: bnum(tO.denormWeight).div(bnum(p.totalWeight)),
            swapFee: bnum(p.swapFee),
        };

        if (fromWei) {
            obj.balanceIn = obj.balanceIn.times(BONE);
            obj.balanceOut = obj.balanceOut.times(BONE);
            obj.weightIn = obj.weightIn.times(BONE);
            obj.weightOut = obj.weightOut.times(BONE);
            obj.swapFee = obj.swapFee.times(BONE);
        }

        poolData.push(obj);
    });
    return poolData;
};

export const findBestSwaps = (
    balancers: Pool[],
    swapMethod: SwapMethods,
    inputAmount: BigNumber,
    maxBalancers: number,
    costOutputToken: BigNumber
): SorSwaps => {
    return sor.linearizedSolution(
        formatPoolData(balancers),
        swapMethod,
        inputAmount.toString(),
        maxBalancers,
        costOutputToken.toString()
    );
};

/* Go through selected swaps and determine the total output */
export const calcTotalOutput = (swaps: Swap[], poolData: Pool[]): BigNumber => {
    try {
        let totalAmountOut = bnum(0);
        swaps.forEach(swap => {
            const swapAmount = swap.tokenInParam;

            const pool = poolData.find(p => p.id == swap.pool);
            if (!pool) {
                throw new Error(
                    '[Invariant] No pool found for selected balancer index'
                );
            }

            const preview = calcOutGivenIn(
                pool.balanceIn,
                pool.weightIn,
                pool.balanceOut,
                pool.weightOut,
                bnum(swapAmount),
                pool.swapFee
            );

            totalAmountOut = totalAmountOut.plus(preview);
        });
        return totalAmountOut;
    } catch (e) {
        throw new Error(e);
    }
};

export const calcPrice = (amountIn, amountOut) => {
    console.log('[calcPrice]', {
        amountIn: amountIn.toString(),
        amountOut: amountOut.toString(),
        price: amountIn.div(amountOut).toString(),
    });
    return amountIn.div(amountOut);
};

export const calcExpectedSlippage = (
    spotPrice: BigNumber,
    effectivePrice: BigNumber
) => {
    const spotPercentage = spotPrice.div(effectivePrice).times(100);
    console.log('[calcExpectedSlippage]', {
        spotPrice: spotPrice.toString(),
        effectivePrice: effectivePrice.toString(),
        spotPercentage: spotPercentage.toString(),
        expectedSlippage: bnum(100)
            .minus(spotPercentage)
            .toString(),
    });

    return bnum(100).minus(spotPercentage);
};

export const calcTotalSpotValue = (
    method: SwapMethods,
    swaps: Swap[],
    poolData: Pool[]
) => {
    let totalValue = bnum(0);
    swaps.forEach(swap => {
        const swapAmount =
            method === SwapMethods.EXACT_IN
                ? swap.tokenInParam
                : swap.tokenOutParam;
        const pool = poolData.find(p => p.id == swap.pool);
        if (!pool) {
            throw new Error(
                '[Invariant] No pool found for selected balancer index'
            );
        }

        const spotPrice = calcSpotPrice(
            pool.balanceIn,
            pool.weightIn,
            pool.balanceOut,
            pool.weightOut,
            pool.swapFee
        );

        if (method === SwapMethods.EXACT_IN) {
            totalValue = totalValue.plus(bnum(swapAmount).div(spotPrice));
        } else if (method === SwapMethods.EXACT_OUT) {
            totalValue = totalValue.plus(bnum(swapAmount).times(spotPrice));
        }
    });

    return totalValue;
};

/* Go through selected swaps and determine the total input */
export const calcTotalInput = (
    swaps: Swap[],
    poolData: Pool[],
    maxPrice: string,
    maxAmountIn: string
): BigNumber => {
    try {
        let totalAmountIn = bnum(0);
        swaps.forEach(swap => {
            const swapAmount = swap.tokenOutParam;
            const pool = poolData.find(p => p.id == swap.pool);
            if (!pool) {
                throw new Error(
                    '[Invariant] No pool found for selected balancer index'
                );
            }

            const preview = calcInGivenOut(
                pool.balanceIn,
                pool.weightIn,
                pool.balanceOut,
                pool.weightOut,
                bnum(swapAmount),
                pool.swapFee
            );

            totalAmountIn = totalAmountIn.plus(preview);
        });

        return totalAmountIn;
    } catch (e) {
        throw new Error(e);
    }
};