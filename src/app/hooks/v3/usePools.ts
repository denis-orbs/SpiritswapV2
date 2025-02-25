import { computePoolAddress } from '../../../v3-sdk';
import { Currency, Token, Pool } from '../../../v3-sdk/entities';

import PoolABI from 'utils/web3/abis/v3/algebraPool.json';

import contracts from 'constants/contracts';
import { useMemo } from 'react';

import { Interface } from '@ethersproject/abi';

import { useInternet } from './useInternet';
import { useToken } from '../useToken';
import { usePreviousNonErroredArray } from './usePrevious';
import { CHAIN_ID } from 'constants/index';
import { usePoolsGlobalState } from './usePoolsGlobalState';
import { useTokenV3 } from './useCurrency';

const POOL_STATE_INTERFACE = new Interface(PoolABI);

export enum PoolState {
  LOADING,
  NOT_EXISTS,
  EXISTS,
  INVALID,
}

export function usePools(
  poolKeys: [Currency | undefined, Currency | undefined][],
): [PoolState, Pool | null][] {
  const transformed: ([Token, Token] | null)[] = useMemo(() => {
    return poolKeys.map(([currencyA, currencyB]) => {
      if (!currencyA || !currencyB) return null;

      const tokenA = currencyA?.wrapped;
      const tokenB = currencyB?.wrapped;
      if (!tokenA || !tokenB || tokenA.equals(tokenB)) return null;
      const [token0, token1] = tokenA.sortsBefore(tokenB)
        ? [tokenA, tokenB]
        : [tokenB, tokenA];
      return [token0, token1];
    });
  }, [poolKeys]);

  const poolAddresses: (string | undefined)[] = useMemo(() => {
    const poolDeployerAddress = contracts.v3AlgebraPoolDeployer[CHAIN_ID];

    return transformed.map(value => {
      if (!poolDeployerAddress || !value) return undefined;

      return computePoolAddress({
        poolDeployer: poolDeployerAddress,
        tokenA: value[0],
        tokenB: value[1],
      });
    });
  }, [transformed]);

  const globalState0s = usePoolsGlobalState(poolAddresses, 'globalState');

  const liquidities = usePoolsGlobalState(poolAddresses, 'liquidity');

  const tickSpacings = usePoolsGlobalState(poolAddresses, 'tickSpacing');

  return useMemo(() => {
    return poolKeys.map((_key, index) => {
      const [token0, token1] = transformed[index] ?? [];

      if (!token0 || !token1) return [PoolState.INVALID, null];

      const {
        result: globalState,
        loading: globalStateLoading,
        valid: globalStateValid,
      } = globalState0s[index];

      const {
        result: liquidity,
        loading: liquidityLoading,
        valid: liquidityValid,
      } = liquidities[index];

      const {
        result: tickSpacing,
        loading: tickSpacingLoading,
        valid: tickSpacingValid,
      } = tickSpacings[index];

      if (!globalStateValid || !liquidityValid || !tickSpacingValid)
        return [PoolState.INVALID, null];
      if (globalStateLoading || liquidityLoading || tickSpacingLoading)
        return [PoolState.LOADING, null];

      if (!globalState || !liquidity || !tickSpacing)
        return [PoolState.NOT_EXISTS, null];

      if (!globalState.price || globalState.price.eq(0))
        return [PoolState.NOT_EXISTS, null];

      try {
        return [
          PoolState.EXISTS,
          new Pool(
            token0,
            token1,
            globalState.fee,
            globalState.price,
            //@ts-ignore
            liquidity,
            globalState.tick,
            tickSpacing,
          ),
        ];
      } catch (error) {
        return [PoolState.NOT_EXISTS, null];
      }
    });
  }, [liquidities, poolKeys, globalState0s, tickSpacings, transformed]);
}

export function usePool(
  currencyA: Currency | undefined,
  currencyB: Currency | undefined,
  // feeAmount: FeeAmount | undefined
): [PoolState, Pool | null] {
  const poolKeys: [Currency | undefined, Currency | undefined][] = useMemo(
    () => [[currencyA, currencyB]],
    [currencyA, currencyB],
  );

  return usePools(poolKeys)[0];
}

export function useTokensSymbols(token0: string, token1: string) {
  const internet = useInternet();
  const _token0 = useTokenV3(token0);
  const _token1 = useTokenV3(token1);

  return useMemo(() => [_token0, _token1], [_token0, _token1, internet]);
}
