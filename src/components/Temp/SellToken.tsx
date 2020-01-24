import React from 'react';
import TokenPanel from './TokenPanel';
import { observer } from 'mobx-react';
import { useStores } from '../../contexts/storesContext';
import { InputValidationStatus, SwapMethods } from 'stores/SwapForm';
import { bnum, formatPctString, fromWei, str } from 'utils/helpers';
import { ExactAmountInPreview } from 'stores/Proxy';
import { calcExpectedSlippage } from '../../utils/sorWrapper';

const SellToken = observer(
    ({
        inputID,
        inputName,
        tokenName,
        tokenBalance,
        truncatedTokenBalance,
        tokenAddress,
        setModalOpen,
        errorMessage,
        showMax,
    }) => {
        const {
            root: {
                proxyStore,
                swapFormStore,
                providerStore,
                tokenStore,
                errorStore,
            },
        } = useStores();

        const onChange = async event => {
            const { value } = event.target;
            updateSwapFormData(value);
        };

        const updateSwapFormData = async value => {
            swapFormStore.inputs.setBuyFocus = false;
            swapFormStore.inputs.setSellFocus = true;
            swapFormStore.inputs.type = SwapMethods.EXACT_IN;
            swapFormStore.inputs.inputAmount = value;

            const inputStatus = swapFormStore.getSwapFormInputValidationStatus(
                value
            );

            if (inputStatus === InputValidationStatus.VALID) {
                const preview = await previewSwapExactAmountInHandler();
                console.log(preview);

                let output = {
                    validSwap: false,
                };

                if (preview.error) {
                    swapFormStore.updateInputsFromObject({
                        activeErrorMessage: preview.error,
                    });
                }

                if (preview.validSwap) {
                    output['outputAmount'] = fromWei(preview.totalOutput);
                    output['effectivePrice'] = str(preview.effectivePrice);
                    output['spotPrice'] = str(preview.spotPrice);
                    output['expectedSlippage'] = formatPctString(
                        calcExpectedSlippage(
                            preview.spotPrice,
                            preview.effectivePrice
                        )
                    );
                    output['swaps'] = preview.swaps;
                    output['validSwap'] = true;
                    output['activeErrorMessage'] = '';
                    swapFormStore.setTradeCompositionEAI(preview);
                } else {
                    swapFormStore.resetTradeComposition();
                }

                swapFormStore.updateInputsFromObject(output);
                swapFormStore.updateOutputsFromObject(output);
            } else {
                console.log('[Invalid Input]', inputStatus, value);
                swapFormStore.updateInputsFromObject({
                    outputAmount: '',
                    activeErrorMessage: inputStatus,
                    // clear preview
                });
                swapFormStore.resetTradeComposition();
            }
        };

        const previewSwapExactAmountInHandler = async (): Promise<ExactAmountInPreview> => {
            const inputs = swapFormStore.inputs;
            const { inputToken, outputToken, inputAmount } = inputs;

            if (!inputAmount || inputAmount === '') {
                return {
                    inputAmount: bnum(inputAmount),
                    totalOutput: null,
                    effectivePrice: null,
                    spotPrice: null,
                    swaps: null,
                    validSwap: false,
                };
            }

            return await proxyStore.previewBatchSwapExactIn(
                inputToken,
                outputToken,
                bnum(inputAmount)
            );
        };

        const { inputs, outputs } = swapFormStore;
        const { inputAmount, setSellFocus } = inputs;

        return (
            <TokenPanel
                headerText="Token to Sell"
                defaultValue={inputAmount}
                onChange={e => onChange(e)}
                updateSwapFormData={updateSwapFormData}
                inputID={inputID}
                inputName={inputName}
                tokenName={tokenName}
                tokenBalance={tokenBalance}
                truncatedTokenBalance={truncatedTokenBalance}
                tokenAddress={tokenAddress}
                setModalOpen={setModalOpen}
                setFocus={setSellFocus}
                errorMessage={errorMessage}
                showMax={showMax}
            />
        );
    }
);

export default SellToken;